// ==UserScript==
// @h2o-id      4a.dock.panel
// @name         4A.🟩🎖️ Dock Panel 🎖️
// @namespace    H2O.ChatGPT.DockPanel
// @version      3.2.0
// @description  Dock Panel shell: panel UI + sidebar sync + rail buttons + tab router + disk state. Highlights moved to separate "Highlights Tab" script. Preserves legacy APIs: H2O.Dock / H2O.PanelSide.
// @author       HumamDev
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  /* ============================================================================
   * 💧 H2O — Dock Panel (Contract v2, Stage 1: Foundation / Mechanics) 🧱⚙️
   * - Owns: panel shell + sidebar open/close sync + rail buttons + tab router
   * - Exposes: VAULT.api.getContract(), open/close/toggle, setView/getView, requestRender
   * - Highlights rendering is externalized into separate "Highlights Tab" script.
   * - Preserves: H2O.Dock / H2O.PanelSide legacy bridge + Dock.registerTab/getTab
   * ========================================================================== */

  /* ───────────────────────────── 0) Identity (Contract) ───────────────────────────── */

  /** @core Root window ref. */
  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;

  /** @core Identity. */
  const TOK = 'DP';
  const PID = 'dckpnl';
  const CID = 'DPANEL';
  const SkID = 'dcpn';

  const MODTAG = 'DPanel';
  const MODICON = '🎖️';
  const EMOJI_HDR = '🟩';

  const SUITE = 'prm';
  const HOST  = 'cgx';

  const DsID = PID;
  const BrID = PID;

  /* ───────────────────────────── Vault / Registries ───────────────────────────── */

  /** @core Vault root. */
  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || {};

  /** @core Bounded vault for this module (Brain). */
  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});
  VAULT.meta = VAULT.meta || { tok: TOK, pid: PID, cid: CID, skid: SkID, modtag: MODTAG, suite: SUITE, host: HOST };

  H2O.KEYS = H2O.KEYS || {};
  H2O.EV   = H2O.EV   || {};
  H2O.SEL  = H2O.SEL  || {};
  H2O.UI   = H2O.UI   || {};

  /* ───────────────────────────── 1) Tokens (NS_/KEY_/EV_/ATTR_/UI_/SEL_/CFG_/CSS_) ───────────────────────────── */

  /** @core Disk namespace. */
  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;

  /** @core Memory namespaces. */
  const NS_MEM_GUARD = `${TOK}:${PID}:guard`;
  const NS_MEM_ONCE  = `${TOK}:${PID}:once`;

  /** @core Disk keys. */
  const KEY_DPANEL_STATE_PANEL_V1  = `${NS_DISK}:state:panel:v1`;
  const KEY_DPANEL_STATE_LEGACY_V1 = 'ho_hl_panel_state_v1';
  const KEY_DPANEL_MIG_STATE_V1    = `${NS_DISK}:migrate:panel_state:v1`;

  /** @core Events (new + legacy). */
  const EV_DPANEL_TABS           = 'h2o-dock:tabs';
  const EV_DPANEL_READY          = 'h2o:dpanel:ready';

  const EV_H2O_INDEX_UPDATED     = 'h2o:index:updated';
  const EV_H2O_BOOKMARKS_CHANGED = 'h2o:bookmarks:changed';
  const EV_H2O_NOTES_CHANGED     = 'h2o:notes:changed';
  const EV_H2O_INLINE_CHANGED    = 'h2o:inline:changed';
  const EV_H2O_MSG_REMOUNTED     = 'h2o:message:remounted';
  const EV_H2O_MSG_MOUNT_REQUEST = 'h2o:message:mount:request';

  const EV_LEG_BOOKMARKS_CHANGED_1 = 'h2o-bookmarks:changed';
  const EV_LEG_BOOKMARKS_CHANGED_2 = 'h2o-bookmarks:changed';
  const EV_LEG_NOTES_CHANGED_1     = 'h2o-notes:changed';
  const EV_LEG_NOTES_CHANGED_2     = 'h2o-notes:changed';
  const EV_LEG_INLINE_CHANGED      = 'h2o-inline:changed';
  const EV_LEG_MSG_REMOUNTED       = 'h2o:message-remounted';

  /** @core ATTR_* */
  const ATTR_DPANEL_CGXUI       = 'data-cgxui';
  const ATTR_DPANEL_CGXUI_OWNER = 'data-cgxui-owner';
  const ATTR_DPANEL_CGXUI_STATE = 'data-cgxui-state';
  const ATTR_DPANEL_CGXUI_VIEW  = 'data-cgxui-view';

  const ATTR_DPANEL_RAIL_DUMMY  = 'data-cgxui-rail-dummy';
  const ATTR_DPANEL_NATIVE_CLOSE = 'data-h2o-native-close';


  const ATTR_DPANEL_TESTID      = 'data-testid';
  const ATTR_DPANEL_ARIA_LABEL  = 'aria-label';

  const ATTR_DPANEL_MSG_ROLE    = 'data-message-author-role';
  const ATTR_DPANEL_HL_ID       = 'data-h2o-hl-id';
  const ATTR_DPANEL_MSG_ID      = 'data-h2o-msg-id';
  const ATTR_DPANEL_BM          = 'data-h2o-bm';
  const ATTR_DPANEL_BG          = 'data-h2o-bg';
  const ATTR_DPANEL_MODE        = 'data-h2o-mode';
  const ATTR_DPANEL_ARRANGE     = 'data-h2o-arrange';
  const ATTR_DPANEL_COLLAPSED   = 'data-h2o-collapsed';

  const ATTR_DPANEL_VIEW_DD     = 'data-h2o-view-dd';
  const ATTR_DPANEL_VIEW_MENU   = 'data-h2o-view-menu';
  const ATTR_DPANEL_SET_VIEW    = 'data-h2o-set-view';
  const ATTR_DPANEL_TITLE_BTN   = 'data-h2o-panel-title';
  const ATTR_DPANEL_TITLE_TEXT  = 'data-h2o-title-text';
  const ATTR_DPANEL_NOTES_BOUND = 'data-h2o-notes-bound';

  const ATTR_DPANEL_SB_OPEN     = 'data-h2o-sb-open';
  const ATTR_DPANEL_RAIL_VIEW   = 'data-h2o-rail-view';

  /** @core UI tokens (SkID-based). */
  const UI_DPANEL_PANEL   = `${SkID}-panel`;
  const UI_DPANEL_LIST    = `${SkID}-list`;
  const UI_DPANEL_MODEBAR = `${SkID}-modebar`;
  const UI_DPANEL_HDR     = `${SkID}-hdr`;
  const UI_DPANEL_MENU    = `${SkID}-menu`;

  /** @core IDs (SkID-based). */
  const CSS_DPANEL_STYLE_ID  = `cgxui-${SkID}-style`;
  const ID_DPANEL_PING       = `cgxui-${SkID}-ping`;
  const ID_DPANEL_SB_OVERLAY = `cgxui-${SkID}-sb-overlay`;

  /** @core CSS class tokens (SkID-based). */
  const CSS_DPANEL_CLS_HDR       = `cgxui-${SkID}-hdr`;
  const CSS_DPANEL_CLS_TITLE_DD  = `cgxui-${SkID}-title-dd`;
  const CSS_DPANEL_CLS_TITLE_BTN = `cgxui-${SkID}-title-btn`;
  const CSS_DPANEL_CLS_CARET     = `cgxui-${SkID}-caret`;
  const CSS_DPANEL_CLS_MENU      = `cgxui-${SkID}-menu`;
  const CSS_DPANEL_CLS_MENU_ITEM = `cgxui-${SkID}-menu-item`;
  const CSS_DPANEL_CLS_MODEBAR   = `cgxui-${SkID}-modebar`;
  const CSS_DPANEL_CLS_BLOCK     = `cgxui-${SkID}-block`;
  const CSS_DPANEL_CLS_LABEL     = `cgxui-${SkID}-label`;
  const CSS_DPANEL_CLS_PILL      = `cgxui-${SkID}-pill`;
  const CSS_DPANEL_CLS_TOOLS     = `cgxui-${SkID}-tools`;
  const CSS_DPANEL_CLS_BG_SWITCH = `cgxui-${SkID}-bg-switch`;
  const CSS_DPANEL_CLS_BG_BTN    = `cgxui-${SkID}-bg-btn`;
  const CSS_DPANEL_CLS_CLOSE_BTN = `cgxui-${SkID}-close-btn`;
  const CSS_DPANEL_CLS_LIST      = `cgxui-${SkID}-list`;
  const CSS_DPANEL_CLS_EMPTY     = `cgxui-${SkID}-empty`;
  const CSS_DPANEL_CLS_SEC       = `cgxui-${SkID}-sec`;
  const CSS_DPANEL_CLS_SEC_TITLE = `cgxui-${SkID}-sec-title`;
  const CSS_DPANEL_CLS_CHEVRON   = `cgxui-${SkID}-chevron`;
  const CSS_DPANEL_CLS_ROW       = `cgxui-${SkID}-row`;
  const CSS_DPANEL_CLS_DOT       = `cgxui-${SkID}-dot`;
  const CSS_DPANEL_CLS_ROW_MAIN  = `cgxui-${SkID}-row-main`;
  const CSS_DPANEL_CLS_ROW_TEXT  = `cgxui-${SkID}-row-text`;
  const CSS_DPANEL_CLS_SUMMARY   = `cgxui-${SkID}-summary`;
  const CSS_DPANEL_CLS_SUM_ITEM  = `cgxui-${SkID}-sum-item`;

  /** @core Central selector registry. */
  const SEL_DPANEL = Object.freeze({
    DOC_EL: 'documentElement',
    BODY: 'body',
    HEADER: 'header',
    SB_TINY_ICON_HOST: '.icon, .icon-lg',

    MSG_ANY: `[${ATTR_DPANEL_MSG_ROLE}="assistant"], [${ATTR_DPANEL_MSG_ROLE}="user"]`,
    MSG_A:   `[${ATTR_DPANEL_MSG_ROLE}="assistant"]`,
    MSG_Q:   `[${ATTR_DPANEL_MSG_ROLE}="user"]`,

    MARK_HL: 'mark[class*="inline-hl"]',

    SB_NAV_HISTORY: 'nav[aria-label="Chat history"]',
    SB_ASIDE_TESTID: `aside[${ATTR_DPANEL_TESTID}="left-sidebar"]`,
    SB_ASIDE_SIDEBAR: 'aside[aria-label="Sidebar"]',
    SB_ASIDE_HISTORY: 'aside[aria-label="Chat history"]',
    SB_ASIDE_ANY: 'aside',
    SB_CLOSE_BTN: '[data-testid="close-sidebar-button"], button[aria-label="Close sidebar"], button[aria-label*="Close sidebar"]',
    SB_TINY_RAIL: '#stage-sidebar-tiny-bar',
    SB_TINY_STACK_PRIMARY: 'div.mt-\\(\\--sidebar-section-first-margin-top\\)',
    SB_TINY_STACK_FALLBACK: ':scope > div:nth-child(2)',
    SB_TINY_ITEM_A: 'a[data-sidebar-item="true"]',

    UNMOUNTED_CACHE: '[class*="unmounted-hl-cache"]',

    PANEL: `aside[${ATTR_DPANEL_CGXUI_OWNER}="${SkID}"][${ATTR_DPANEL_CGXUI}="${UI_DPANEL_PANEL}"]`,
    LIST:  `[${ATTR_DPANEL_CGXUI_OWNER}="${SkID}"] [${ATTR_DPANEL_CGXUI}="${UI_DPANEL_LIST}"]`,

    ANY_BTN_ARIA: `button[${ATTR_DPANEL_ARIA_LABEL}], [role="button"][${ATTR_DPANEL_ARIA_LABEL}]`,
  });

  /** @core Config knobs. */
  const CFG_DPANEL = Object.freeze({
    Z_MAX: 2147483647,
    Z_PING: 2147483646,
    PING_VISIBLE_MS: 650,
    REINSERT_DELAY_MS: 250,
    RETRY_DELAY_MS: 800,

    SIDEBAR_CLICK_LOCK_MS: 200,
    SIDEBAR_ANIM_MS: 150,

    OPEN_SIDEBAR_DELAY_MS: 90,
    CLOSE_PANEL_DELAY_MS: 90,
  });

  /** @core Rail items. */
  const DPANEL_RAIL_ITEMS = Object.freeze([
    { view:'highlights', title:'Highlights', color:'#C7A106', txt:'H' }, // 🟡
    { view:'bookmarks',  title:'Bookmarks',  color:'#2C7A4A', txt:'B' }, // 🟢
    { view:'notes',      title:'Notes',      color:'#A83A3A', txt:'N' }, // 🔴
    { view:'attachments', title:'Attachments', color:'#345E9E', txt:'A' }, // 🔵
    { view:'slot5', title:'Slot 5', color:'#D47A38', dummy:true },       // 🟠
    { view:'slot6', title:'Slot 6', color:'#6740A8', dummy:true },       // 🟣
    { view:'slot7', title:'Slot 7', color:'#C05C95', dummy:true },       // 🌸
    { view:'slot8', title:'Slot 8', color:'#3FA7D6', dummy:true },       // 🌤️
  ]);

  /* ───────────────────────────── 2) DIAG (bounded) ───────────────────────────── */

  VAULT.diag = VAULT.diag || { ver: 'dpanel-shell-v3', bootCount: 0, lastBootAt: 0, steps: [], lastError: null };
  VAULT.stateFlag = VAULT.stateFlag || { booted: false };
  const STATE_DPANEL = VAULT.stateFlag;

  /** @helper DIAG step. */
  function DIAG_DP_step(name, extra) {
    const d = VAULT.diag;
    d.steps.push({ t: Date.now(), name, extra: extra ?? null });
    if (d.steps.length > 120) d.steps.shift();
    try { console.log(`[${MODICON}][${MODTAG}]`, name, extra ?? ''); } catch (_) {}
  }
  /** @helper DIAG safe. */
  function DIAG_DP_safe(name, extra) { try { DIAG_DP_step(name, extra); } catch (_) {} }

  /* ───────────────────────────── 3) UTIL ───────────────────────────── */

  /** @helper LS get. */
  function UTIL_DP_lsGet(key) { try { return W.localStorage.getItem(key); } catch (_) { return null; } }
  /** @helper LS set. */
  function UTIL_DP_lsSet(key, val) { try { W.localStorage.setItem(key, val); return true; } catch (_) { return false; } }
  /** @helper LS del. */
  function UTIL_DP_lsDel(key) { try { W.localStorage.removeItem(key); } catch (_) {} }
  /** @helper JSON parse. */
  function UTIL_DP_jsonParse(s, fallback) { try { return JSON.parse(s); } catch (_) { return fallback; } }

  /** @helper q. */
  function DOM_DP_q(sel, root = document) { return root.querySelector(sel); }
  /** @helper qa. */
  function DOM_DP_qa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
  /** @helper visible. */
  function DOM_DP_isVisible(el) {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    return !!(el.offsetParent !== null || el.getClientRects().length);
  }

  /** @helper escape html. */
  function UTIL_DP_escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** @helper idle wrapper. */
  function UTIL_DP_idle(fn, timeout = 1200) {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout });
    else setTimeout(fn, 350);
  }

  /** @helper normalize msg id. */
  function UTIL_DP_normalizeMsgId(id) {
    const s = String(id || '').trim();
    if (!s) return s;
    const m = s.match(/^conversation-turn-(.+)$/);
    return m ? m[1] : s;
  }

  /** @helper find conversation-turn selector. */
  function UTIL_DP_selConversationTurnByEsc(esc) { return `[${ATTR_DPANEL_TESTID}="conversation-turn-${esc}"]`; }

  /** @helper clean bookmark snippet. */
  function UTIL_DP_cleanBookmarkSnippet(s) {
    s = (s || '').replace(/\s+/g, ' ').trim();
    s = s.replace(/^\s*ChatGPT\s+said:\s*/i, '');
    s = s.replace(/^\s*TITLE\s*[:—-]?\s*/i, '');
    s = s.replace(/^\s*Thought\s+for\s+[\d.,]+\s*(ms|s|sec|secs|seconds|m|min|mins|minutes|h|hr|hrs|hours)\s*/i, '');
    s = s.replace(/^\s*Thought\s+for\s+/i, '');
    return s.trim();
  }

  /* ───────────────────────────── 4) STORE_DP ───────────────────────────── */

  /** @helper One-time legacy state migration (ho_* -> h2o:*) */
  function MIG_DPANEL_state_once() {
    try { if (UTIL_DP_lsGet(KEY_DPANEL_MIG_STATE_V1) === '1') return; } catch (_) {}

    try {
      const legacy = UTIL_DP_jsonParse(UTIL_DP_lsGet(KEY_DPANEL_STATE_LEGACY_V1), null);
      if (legacy && typeof legacy === 'object') {
        const cur = UTIL_DP_jsonParse(UTIL_DP_lsGet(KEY_DPANEL_STATE_PANEL_V1), null);
        if (!cur || typeof cur !== 'object') {
          UTIL_DP_lsSet(KEY_DPANEL_STATE_PANEL_V1, JSON.stringify(legacy));
        }
      }
    } catch (_) {}

    try { UTIL_DP_lsDel(KEY_DPANEL_STATE_LEGACY_V1); } catch (_) {}
    try { UTIL_DP_lsSet(KEY_DPANEL_MIG_STATE_V1, '1'); } catch (_) {}
  }

  /** @helper Load persisted panel state. */
  function STORE_DP_loadPanelState() {
    MIG_DPANEL_state_once();
    const cur = UTIL_DP_jsonParse(UTIL_DP_lsGet(KEY_DPANEL_STATE_PANEL_V1), null);
    if (cur && typeof cur === 'object') return cur;
    return { open: false, bg: 'bar', view: 'highlights', mode: 'answer', arrange: 'order' };
  }

  /** @helper Save persisted panel state (partial merge). */
  function STORE_DP_savePanelState(partial) {
    const cur = STORE_DP_loadPanelState();
    const next = { ...cur, ...partial };
    UTIL_DP_lsSet(KEY_DPANEL_STATE_PANEL_V1, JSON.stringify(next));
    return next;
  }

  /* ───────────────────────────── 5) Legacy Bridges (H2O.Dock / H2O.PanelSide) ───────────────────────────── */

  H2O.Dock = H2O.Dock || H2O.PanelSide || {};
  H2O.PanelSide = H2O.Dock;

  const Dock = H2O.Dock;
  Dock.tabs = Dock.tabs || Object.create(null);

  /** @core Register Dock tab. */
  Dock.registerTab = Dock.registerTab || function registerTab(id, def) {
    if (!id || !def) return;
    Dock.tabs[id] = { id, ...def };
    try { W.dispatchEvent(new Event(EV_DPANEL_TABS)); } catch (_) {}
  };

  /** @helper Get Dock tab. */
  Dock.getTab = Dock.getTab || function getTab(id) { return Dock.tabs[id] || null; };

  /** @helper Export diag. */
  H2O.PanelSide.diagDump = () => {
    try { return JSON.parse(JSON.stringify(VAULT.diag)); } catch (_) { return {}; }
  };

  /* ───────────────────────────── 6) Runtime State (vault-bound) ───────────────────────────── */

  VAULT.state = VAULT.state || {
    panelEl: null,
    listEl: null,

    moRoot: null,
    moRail: null,
    railRAF: 0,

    isOpen: false,
    renderPending: false,

    view: 'highlights',
    mode: 'answer',
    arrange: 'order',
    bg: 'bar',

    reinsertT: 0,
    retryPanelT: 0,
    scratchT: 0,

    sidebarClickLock: false,

    nativeCloseBtn: null,
    nativeCloseFn: null,

    handlers: {
      onClick: null,
      onError: null,
      onRejection: null,
      onResize: null,
      onPopState: null,
      onLoad: null,
      updateBindings: [],
    },
  };
  const S = VAULT.state;

  /* ───────────────────────────── 7) Crash Hooks (once) ───────────────────────────── */

  /** @critical Install crash hooks once. */
  function CORE_DP_installCrashHooksOnce() {
    const k = `${NS_MEM_ONCE}:crash`;
    if (W[k]) return;
    W[k] = 1;

    const onError = (e) => DIAG_DP_safe('window:error', { msg: e?.message, file: e?.filename, line: e?.lineno, col: e?.colno });
    const onRej = (e) => DIAG_DP_safe('window:unhandledrejection', String(e?.reason?.stack || e?.reason || 'unknown'));

    S.handlers.onError = onError;
    S.handlers.onRejection = onRej;

    W.addEventListener('error', onError, true);
    W.addEventListener('unhandledrejection', onRej, true);
  }

  /* ───────────────────────────── 8) UI (CSS injection) ───────────────────────────── */

  /** @core Inject cgxui styles once. */
  function UI_DP_injectStylesOnce() {
    if (document.getElementById(CSS_DPANEL_STYLE_ID)) return;

    const PANEL_SEL = `aside[${ATTR_DPANEL_CGXUI_OWNER}="${SkID}"][${ATTR_DPANEL_CGXUI}="${UI_DPANEL_PANEL}"]`;

    const css = `
/* ===================== ${EMOJI_HDR} ${MODICON} ${MODTAG} (cgxui-owned) ===================== */
${PANEL_SEL}{
  position: fixed;
  top: 0;
  left: 0;
  width: 260px;
  max-width: 80vw;
  height: 100vh;
  background: #050816;
  z-index: ${CFG_DPANEL.Z_MAX};
  display: flex;
  flex-direction: column;
  transform: translateX(-100%);
  opacity: 0;
  pointer-events: none;
  transition: transform .22s ease, opacity .22s ease, left .22s ease, width .22s ease;
  color-scheme: dark;
}
${PANEL_SEL}[${ATTR_DPANEL_CGXUI_STATE}="open"]{
  transform: translateX(0);
  opacity: 1;
  pointer-events: auto;
}
.${CSS_DPANEL_CLS_HDR}{
  padding: 10px 12px; display:flex; flex-direction:row;
  align-items:center; justify-content:space-between; gap:6px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.${CSS_DPANEL_CLS_TOOLS}{ display:flex; align-items:center; gap:8px; }
.${CSS_DPANEL_CLS_BG_SWITCH}{ display:flex; gap:4px; }
.${CSS_DPANEL_CLS_BG_BTN}{
  width:14px;height:14px;border-radius:999px;
  border:1px solid rgba(148,163,184,0.55);
  box-sizing:border-box; cursor:pointer; padding:0; outline:none;
  background: var(--bg-color, transparent);
  box-shadow: 0 0 0 1px rgba(15,23,42,0.9);
  opacity:.9;
  transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease, opacity .12s ease;
}
.${CSS_DPANEL_CLS_BG_BTN}:hover{ transform: translateY(-1px); border-color: rgba(226,232,240,.95); box-shadow: 0 0 4px rgba(0,0,0,.7); }
.${CSS_DPANEL_CLS_BG_BTN}[${ATTR_DPANEL_CGXUI_STATE}="active"]{ box-shadow: 0 0 0 1px rgba(248,250,252,.9), 0 0 6px rgba(0,0,0,.9); }
.${CSS_DPANEL_CLS_CLOSE_BTN}{
  width:24px;height:24px;border-radius:999px;
  border:1px solid rgba(148,163,184,0.5);
  background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.10), transparent 60%);
  color: rgba(229,231,235,0.95);
  display:flex; align-items:center; justify-content:center;
  cursor:pointer; padding:0; opacity:.9;
  transition: opacity .15s ease, background .15s ease, border-color .15s ease, transform .1s ease;
}
.${CSS_DPANEL_CLS_CLOSE_BTN}:hover{
  opacity:1;
  background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.16), transparent 60%);
  border-color: rgba(203,213,225,0.9);
  transform: translateY(-1px);
}
.${CSS_DPANEL_CLS_TITLE_DD}{ position:relative; display:inline-flex; align-items:center; }
.${CSS_DPANEL_CLS_TITLE_BTN}{
  font-size:14px; font-weight:600; letter-spacing:.2px;
  color: rgba(255,255,255,0.45);
  display:inline-flex; align-items:center; gap:8px;
  cursor:pointer; background:transparent; border:0; padding:0;
}
.${CSS_DPANEL_CLS_CARET}{ font-size:12px; opacity:.55; transform: translateY(.5px); }
.${CSS_DPANEL_CLS_MENU}{
  position:absolute; top: calc(100% + 8px); left:0;
  min-width:170px; padding:6px; border-radius:12px;
  background: rgba(20,20,20,0.98);
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 10px 30px rgba(0,0,0,0.55);
  display:none; z-index:${CFG_DPANEL.Z_MAX};
}
.${CSS_DPANEL_CLS_TITLE_DD}[${ATTR_DPANEL_CGXUI_STATE}="open"] .${CSS_DPANEL_CLS_MENU}{ display:block; }
.${CSS_DPANEL_CLS_MENU_ITEM}{
  width:100%; text-align:left; border:0; background:transparent;
  color: rgba(255,255,255,0.85);
  padding:8px 10px; border-radius:10px;
  cursor:pointer; font-size:12px; font-weight:600;
}
.${CSS_DPANEL_CLS_MENU_ITEM}:hover{ background: rgba(255,255,255,0.06); }
.${CSS_DPANEL_CLS_MENU_ITEM}[${ATTR_DPANEL_CGXUI_STATE}="active"]{ background: rgba(251,191,36,0.12); color: rgba(255,255,255,0.95); }

.${CSS_DPANEL_CLS_MODEBAR}{ display:flex; justify-content:space-between; padding: 4px 10px 2px; gap:10px; }
.${CSS_DPANEL_CLS_MODEBAR}:empty{ display:none; padding:0; gap:0; }

.${CSS_DPANEL_CLS_BLOCK}{ display:flex; flex-direction:column; align-items:flex-start; gap:2px; }
.${CSS_DPANEL_CLS_LABEL}{ font-size:9px; font-weight:500; opacity:.55; line-height:1; padding-left:4px; color: rgba(255,255,255,0.55); }
.${CSS_DPANEL_CLS_PILL}{ display:inline-flex; gap:3px; padding:2px; border-radius:10px;
  background: rgba(255,255,255,0.03);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05), 0 1px 3px rgba(0,0,0,0.35);
}
.${CSS_DPANEL_CLS_PILL} button{
  padding:2px 8px; min-height:20px;
  border-radius:7px; border:none;
  background: rgba(255,255,255,0.04);
  font-size:10px; font-weight:600; letter-spacing:.15px;
  color: rgba(255,255,255,0.55);
  box-shadow: inset 0 0 1px rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.35);
  cursor:pointer; transition: all .15s ease;
}
.${CSS_DPANEL_CLS_PILL} button:hover{ filter: brightness(1.15); }
.${CSS_DPANEL_CLS_PILL} button[${ATTR_DPANEL_CGXUI_STATE}="active"]{
  background: rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.95);
  box-shadow: inset 0 0 2px rgba(255,255,255,0.12), 0 2px 4px rgba(0,0,0,0.45);
}
.${CSS_DPANEL_CLS_LIST}{ flex:1; overflow-y:auto; padding: 8px 6px 10px; }
.${CSS_DPANEL_CLS_EMPTY}{ font-size:12px; color:#999; padding:8px; }

.${CSS_DPANEL_CLS_SEC}{ margin-bottom: 3px; }
.${CSS_DPANEL_CLS_SEC_TITLE}{
  display:flex; align-items:center; justify-content:space-between;
  width:100%;
  padding: 3px 10px;
  margin: 0 0 4px;
  background: rgba(255,255,255,0.035);
  border-radius: 8px;
  border:none;
  box-shadow: inset 0 1px 2px rgba(255,255,255,0.05), 0 2px 3px rgba(0,0,0,0.35);
  flex-shrink:0;
  font-size:11px; font-weight:600;
  letter-spacing:.15px;
  color: rgba(255,255,255,0.75);
  cursor:pointer;
  transition: all .18s ease;
}
.${CSS_DPANEL_CLS_SEC_TITLE}:hover{ filter: brightness(1.18); box-shadow: inset 0 0 2px rgba(255,255,255,0.07), 0 2px 5px rgba(0,0,0,0.45); }
.${CSS_DPANEL_CLS_SEC_TITLE} .${CSS_DPANEL_CLS_CHEVRON}{ margin-left:auto; font-size:12px; color: rgba(255,255,255,0.55); }

.${CSS_DPANEL_CLS_ROW}{
  position:relative; display:flex; align-items:flex-start; gap:6px;
  padding: 5px 9px; margin-bottom: 5px;
  border-radius: 8px;
  background: rgba(255,255,255,0.02);
  transition: background .15s ease, box-shadow .15s ease, transform .12s ease;
  border:0; text-align:left; width:100%;
}
.${CSS_DPANEL_CLS_ROW}:hover{
  background: rgba(255,255,255,0.06);
  box-shadow: 0 0 0 1px rgba(255,255,255,0.03), 0 2px 4px rgba(0,0,0,0.35);
}
.${CSS_DPANEL_CLS_DOT}{
  width:9px;height:9px;border-radius:999px; flex-shrink:0;
  margin-top: 3px; margin-right:2px;
  display:inline-block;
  background: var(--dot-color, #ffd54f);
  box-shadow: 0 0 0 1px rgba(0,0,0,0.6);
}
.${CSS_DPANEL_CLS_ROW_MAIN}{ flex:1; display:flex; flex-direction:column; gap:2px; }
.${CSS_DPANEL_CLS_ROW_TEXT}{
  font-size:12px; color:#f5f5f5; line-height:1.35;
  max-height: 2.7em; overflow:hidden; display:-webkit-box;
  -webkit-line-clamp:2; -webkit-box-orient: vertical;
}
.${CSS_DPANEL_CLS_SUMMARY}{
  display:flex; flex-wrap:wrap; gap:4px;
  padding: 4px 10px 4px; margin-top:2px;
  border-top: 1px solid rgba(148,163,184,0.25);
  font-size:10px; color:#9ca3af;
}
.${CSS_DPANEL_CLS_SUM_ITEM}{ display:inline-flex; align-items:center; gap:2px; }
.${CSS_DPANEL_CLS_SUM_ITEM} .${CSS_DPANEL_CLS_DOT}{ width:8px; height:8px; margin-top:0; box-shadow: 0 0 0 1px rgba(15,23,42,0.9); }

/* ========================= 🧊 Rail Nav Buttons ========================= */
.cgxui-${SkID}-rail-nav-btn{
  width: var(--cgxui-rail-btn-w, 24px);
  height: var(--cgxui-rail-btn-h, 24px);
  display: block;
  border-radius: 8px;
  background:
    linear-gradient(145deg, rgba(255,255,255,0.03), rgba(0,0,0,0.10)),
    var(--cgxui-btn-bg, #777) !important;
  opacity: 0.78;
  box-shadow:
    inset 0 0 1px rgba(255,255,255,0.05),
    0 2px 5px rgba(0,0,0,0.30);
  transition: opacity .18s ease, filter .18s ease, box-shadow .18s ease, transform .18s ease;
  pointer-events: none;
  position: relative;
}
[${ATTR_DPANEL_RAIL_VIEW}]:hover .cgxui-${SkID}-rail-nav-btn{
  opacity: 1;
  filter: brightness(1.08);
  box-shadow:
    0 0 6px 2px rgba(255,255,255,0.08),
    0 2px 4px rgba(0,0,0,0.25);
}
[${ATTR_DPANEL_RAIL_DUMMY}="1"] .cgxui-${SkID}-rail-nav-btn{
  opacity: 0.55;
  filter: saturate(0.9);
}
.cgxui-${SkID}-rail-nav-txt{
  position: absolute;
  left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  display: inline-block;
  line-height: 1;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI Variable Text", "Inter", "SF Pro Display", "Helvetica Neue", Arial, sans-serif;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.55px;
  color: rgba(255,255,255,0.72);
  opacity: 0.88;
  text-shadow: 0 1px 0 rgba(0,0,0,0.45);
  pointer-events: none;
  user-select: none;
}


/* Dock close button: keep visible even if native sidebar close exists */
/* (removed hide rule) */
`;
    const style = document.createElement('style');
    style.id = CSS_DPANEL_STYLE_ID;
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  /* ───────────────────────────── 9) Sidebar helpers ───────────────────────────── */

  /** @helper Find left sidebar. */
  function UI_DP_getLeftSidebar() {
    return (
      DOM_DP_q(SEL_DPANEL.SB_NAV_HISTORY) ||
      DOM_DP_q(SEL_DPANEL.SB_ASIDE_TESTID) ||
      DOM_DP_q(SEL_DPANEL.SB_ASIDE_SIDEBAR) ||
      DOM_DP_q(SEL_DPANEL.SB_ASIDE_HISTORY) ||
      DOM_DP_q(SEL_DPANEL.SB_ASIDE_ANY)
    );
  }

  /** @helper Sidebar open test. */
  function UI_DP_isSidebarOpen(sidebar) {
    if (!sidebar) return false;
    const rect = sidebar.getBoundingClientRect();
    const style = getComputedStyle(sidebar);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    if (sidebar.hasAttribute('inert') || sidebar.getAttribute('aria-hidden') === 'true') return false;
    if (rect.width < 140) return false;
    if (rect.right <= 0) return false;
    return true;
  }

  /** @helper True when the collapsed tiny-rail is visible (meaning sidebar is NOT expanded). */
  function UI_DP_isSidebarCollapsedByRail() {
    const rail = DOM_DP_q(SEL_DPANEL.SB_TINY_RAIL);
    if (!rail) return false;
    const r = rail.getBoundingClientRect();
    if (r.width < 20 || r.height < 100) return false;
    if (r.right <= 0 || r.bottom <= 0) return false;
    return true;
  }

  /** @helper Expanded = open AND not collapsed rail. */
  function UI_DP_isSidebarExpandedNow() {
    const sb = UI_DP_getLeftSidebar();
    return UI_DP_isSidebarOpen(sb) && !UI_DP_isSidebarCollapsedByRail();
  }

  /** @helper Find sidebar toggle button (fuzzy). */
  function UI_DP_getSidebarToggleButton() {
    const header = DOM_DP_q(SEL_DPANEL.HEADER);
    const pick = (root) =>
      DOM_DP_qa(SEL_DPANEL.ANY_BTN_ARIA, root)
        .find(b => (b.getAttribute(ATTR_DPANEL_ARIA_LABEL) || '').toLowerCase().includes('sidebar'));
    return (header && pick(header)) || pick(document) || null;
  }

  /** @helper Guarded click. */
  function UI_DP_guardedClick(btn) {
    if (!btn || S.sidebarClickLock) return false;
    S.sidebarClickLock = true;
    try { btn.click(); } catch (_) {}
    setTimeout(() => { S.sidebarClickLock = false; }, CFG_DPANEL.SIDEBAR_CLICK_LOCK_MS);
    return true;
  }

  /** @helper Find explicit close button inside sidebar (best-effort). */
  function UI_DP_findCloseSidebarButton() {
    const sb = UI_DP_getLeftSidebar();
    if (!sb) return null;

    const inside = DOM_DP_qa(SEL_DPANEL.ANY_BTN_ARIA, sb).filter(DOM_DP_isVisible);
    const closeLike = inside.find(b => {
      const lab = (b.getAttribute(ATTR_DPANEL_ARIA_LABEL) || '').toLowerCase();
      return lab.includes('sidebar') && (lab.includes('close') || lab.includes('hide') || lab.includes('collapse'));
    });
    if (closeLike) return closeLike;

    const global = DOM_DP_qa(SEL_DPANEL.ANY_BTN_ARIA).filter(DOM_DP_isVisible);
    return global.find(b => {
      const lab = (b.getAttribute(ATTR_DPANEL_ARIA_LABEL) || '').toLowerCase();
      return lab.includes('sidebar') && (lab.includes('close') || lab.includes('hide') || lab.includes('collapse'));
    }) || null;
  }

  /* ───────────────────────────── Sidebar Native Close Hook ───────────────────────────── */

/** @helper Find ChatGPT native sidebar close button (best-effort). */
function UI_DP_nativeClose_find() {
  const sb = UI_DP_getLeftSidebar();
  const btn = (sb && DOM_DP_q(SEL_DPANEL.SB_CLOSE_BTN, sb)) || DOM_DP_q(SEL_DPANEL.SB_CLOSE_BTN);
  return (btn && DOM_DP_isVisible(btn)) ? btn : null;
}

/** @helper Apply attribute state so CSS can hide Dock close button when native exists. */
function UI_DP_nativeClose_applyState(hasNative) {
  if (!S.panelEl) return;
  if (hasNative) S.panelEl.setAttribute(ATTR_DPANEL_NATIVE_CLOSE, '1');
  else S.panelEl.removeAttribute(ATTR_DPANEL_NATIVE_CLOSE);
}

/** @helper Bind/unbind native close button so it closes the Dock too. */
function UI_DP_nativeClose_sync() {
  UI_DPANEL_ensurePanel();
  if (!S.panelEl) return;

  const btn = UI_DP_nativeClose_find();
  const hasNative = !!btn;

  UI_DP_nativeClose_applyState(hasNative);

  // No change: keep current binding
  if (btn && btn === S.nativeCloseBtn) return;

  // Cleanup old
  try {
    if (S.nativeCloseBtn && S.nativeCloseFn) {
      S.nativeCloseBtn.removeEventListener('click', S.nativeCloseFn, true);
    }
  } catch (_) {}

  S.nativeCloseBtn = btn || null;
  S.nativeCloseFn = null;

  if (!btn) return;

  S.nativeCloseFn = (ev) => {
    // Only act if Dock is open
    if (!S.isOpen) return;
    try {
      // Let native click happen, but also close Dock without re-closing sidebar (prevents double animations).
      setTimeout(() => UI_DPANEL_closePanel({ skipSidebar: true }), 0);
    } catch (_) {}
  };

  try { btn.addEventListener('click', S.nativeCloseFn, true); } catch (_) {}
}
/** @helper Sidebar controller (rail-aware). */
  const UI_DP_SidebarController = {
    _isExpanded() { return UI_DP_isSidebarExpandedNow(); },
    _lab(el) { return ((el && el.getAttribute(ATTR_DPANEL_ARIA_LABEL)) || '').toLowerCase(); },

    open() {
      if (this._isExpanded()) return true;
      const btn = UI_DP_getSidebarToggleButton();
      if (!btn) return false;

      const lab = this._lab(btn);
      const looksOpen = lab.includes('open') || lab.includes('show');
      const looksClose = lab.includes('close') || lab.includes('hide') || lab.includes('collapse');

      const shouldClick = looksOpen || !looksClose;
      if (!shouldClick) return false;

      return !!UI_DP_guardedClick(btn);
    },

    close() {
      const closeBtn = UI_DP_findCloseSidebarButton();
      if (closeBtn) return !!UI_DP_guardedClick(closeBtn);

      const btn = UI_DP_getSidebarToggleButton();
      if (!btn) return false;

      const lab = this._lab(btn);
      const looksOpen = lab.includes('open') || lab.includes('show');
      if (!this._isExpanded() && looksOpen) return false;

      return !!UI_DP_guardedClick(btn);
    },

    toggle() { return this._isExpanded() ? this.close() : this.open(); },
  };

  /** @helper Align panel to sidebar rect. */
  function UI_DP_alignPanelToSidebar() {
    const panel = S.panelEl;
    if (!panel) return;

    const liveSidebar = UI_DP_getLeftSidebar();
    const rect = (liveSidebar && UI_DP_isSidebarOpen(liveSidebar)) ? liveSidebar.getBoundingClientRect() : null;

    panel.style.left = rect ? `${rect.left}px` : '0px';
    panel.style.width = rect ? `${rect.width}px` : '260px';
  }

  /** @helper Base bg from body/html. */
  function UI_DP_getChatGPTBaseBg() {
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
    if (bodyBg && bodyBg !== 'rgba(0,0,0,0)' && bodyBg !== 'transparent') return bodyBg;
    if (htmlBg && htmlBg !== 'rgba(0,0,0,0)' && htmlBg !== 'transparent') return htmlBg;
    return '#212121';
  }

  /* ───────────────────────────── 10) Remount Request helper (tab-safe) ───────────────────────────── */

  /** @helper Ask unmount/core to remount a message (best-effort). */
  function CORE_DP_requestRemountByMsgId(msgId) {
    if (!msgId) return false;

    const ok =
      !!W.H2O?.msg?.ensureMountedById?.(msgId) ||
      !!W.H2O?.msg?.requestMountById?.(msgId);

    if (ok) return true;

    try {
      W.dispatchEvent(new CustomEvent(EV_H2O_MSG_MOUNT_REQUEST, { detail: { msgId } }));
      return true;
    } catch (_) {}
    return false;
  }

  /* ───────────────────────────── 11) Panel UI Build ───────────────────────────── */

  /** @helper Apply background mode. */
  function UI_DPANEL_applyPanelBg(mode) {
    S.bg = mode;
    if (!S.panelEl) return;

    let color;
    switch (mode) {
      case 'body': color = '#2a2a2a'; break;
      case 'side': color = '#141414'; break;
      case 'bar':
      default: color = UI_DP_getChatGPTBaseBg(); break;
    }

    S.panelEl.style.backgroundColor = color;

    DOM_DP_qa(`button[${ATTR_DPANEL_BG}]`, S.panelEl).forEach((b) => {
      const isActive = (b.getAttribute(ATTR_DPANEL_BG) === mode);
      b.setAttribute(ATTR_DPANEL_CGXUI_STATE, isActive ? 'active' : '');
    });

    STORE_DP_savePanelState({ bg: S.bg });
  }

  /** @helper Ensure panel. */
  function UI_DPANEL_ensurePanel() {
    if (S.panelEl && document.contains(S.panelEl)) return S.panelEl;

    const panel = document.createElement('aside');
    panel.setAttribute(ATTR_DPANEL_CGXUI_OWNER, SkID);
    panel.setAttribute(ATTR_DPANEL_CGXUI, UI_DPANEL_PANEL);
    panel.setAttribute(ATTR_DPANEL_CGXUI_STATE, '');
    panel.setAttribute(ATTR_DPANEL_CGXUI_VIEW, '');

    panel.innerHTML = `
      <div class="${CSS_DPANEL_CLS_HDR}" ${ATTR_DPANEL_CGXUI}="${UI_DPANEL_HDR}">
        <div class="${CSS_DPANEL_CLS_TITLE_DD}" ${ATTR_DPANEL_VIEW_DD}="1" ${ATTR_DPANEL_CGXUI_STATE}="">
          <button type="button" class="${CSS_DPANEL_CLS_TITLE_BTN}" ${ATTR_DPANEL_TITLE_BTN}="1">
            <span ${ATTR_DPANEL_TITLE_TEXT}="1">Highlights</span>
            <span class="${CSS_DPANEL_CLS_CARET}" aria-hidden="true">▾</span>
          </button>

          <div class="${CSS_DPANEL_CLS_MENU}" ${ATTR_DPANEL_VIEW_MENU}="1" aria-hidden="true" ${ATTR_DPANEL_CGXUI}="${UI_DPANEL_MENU}">
            <button type="button" class="${CSS_DPANEL_CLS_MENU_ITEM}" ${ATTR_DPANEL_SET_VIEW}="highlights">Highlights</button>
            <button type="button" class="${CSS_DPANEL_CLS_MENU_ITEM}" ${ATTR_DPANEL_SET_VIEW}="bookmarks">Bookmarks</button>
            <button type="button" class="${CSS_DPANEL_CLS_MENU_ITEM}" ${ATTR_DPANEL_SET_VIEW}="notes">Notes</button>
            <button type="button" class="${CSS_DPANEL_CLS_MENU_ITEM}" ${ATTR_DPANEL_SET_VIEW}="attachments">Attachments</button>
          </div>
        </div>

        <div class="${CSS_DPANEL_CLS_TOOLS}">
          <div class="${CSS_DPANEL_CLS_BG_SWITCH}" title="Panel background">
            <button class="${CSS_DPANEL_CLS_BG_BTN}" ${ATTR_DPANEL_BG}="body"></button>
            <button class="${CSS_DPANEL_CLS_BG_BTN}" ${ATTR_DPANEL_BG}="bar"></button>
            <button class="${CSS_DPANEL_CLS_BG_BTN}" ${ATTR_DPANEL_BG}="side"></button>
          </div>
          <button type="button" class="${CSS_DPANEL_CLS_CLOSE_BTN}" aria-label="Hide panel">×</button>
        </div>
      </div>
      <div class="${CSS_DPANEL_CLS_MODEBAR}" ${ATTR_DPANEL_CGXUI}="${UI_DPANEL_MODEBAR}"></div>

      <div class="${CSS_DPANEL_CLS_LIST}" ${ATTR_DPANEL_CGXUI}="${UI_DPANEL_LIST}"></div>
    `;

    const baseBg = UI_DP_getChatGPTBaseBg();
    const darkerBg = 'rgb(24, 24, 24)';

    DOM_DP_qa(`.${CSS_DPANEL_CLS_BG_BTN}`, panel).forEach(btn => {
      const mode = btn.getAttribute(ATTR_DPANEL_BG);
      if (mode === 'bar') btn.style.setProperty('--bg-color', baseBg);
      if (mode === 'body') btn.style.setProperty('--bg-color', '#2a2a2a');
      if (mode === 'side') btn.style.setProperty('--bg-color', darkerBg);
    });

    document.body.appendChild(panel);

    S.panelEl = panel;
    S.listEl = DOM_DP_q(SEL_DPANEL.LIST, panel);

    UI_DP_alignPanelToSidebar();
    return panel;
  }

  /** @helper Panel open? */
  function UI_DPANEL_isPanelOpen() {
    return !!(S.panelEl && S.panelEl.getAttribute(ATTR_DPANEL_CGXUI_STATE) === 'open');
  }

  /** @helper Set title + menu active for view. */
  function CORE_DP_syncHeaderForView() {
    if (!S.panelEl) return;

    const titleText = S.panelEl.querySelector(`[${ATTR_DPANEL_TITLE_TEXT}="1"]`);
    if (titleText) titleText.textContent =
      (S.view === 'highlights') ? 'Highlights' :
      (S.view === 'bookmarks')  ? 'Bookmarks' :
      (S.view === 'notes')      ? 'Notes' :
      (S.view === 'attachments')? 'Attachments' :
      String(S.view || 'Panel');

    const dd = S.panelEl.querySelector(`[${ATTR_DPANEL_VIEW_DD}="1"]`);
    if (dd) {
      DOM_DP_qa(`.${CSS_DPANEL_CLS_MENU_ITEM}`, dd).forEach(b => {
        const isActive = (b.getAttribute(ATTR_DPANEL_SET_VIEW) === S.view);
        b.setAttribute(ATTR_DPANEL_CGXUI_STATE, isActive ? 'active' : '');
      });
    }
  }

  /** @core Set view (stores + sync header). */
  function CORE_DP_setView(view) {
    const v = String(view || 'highlights');
    S.view = v || 'highlights';
    STORE_DP_savePanelState({ view: S.view });
    if (S.panelEl) S.panelEl.setAttribute(ATTR_DPANEL_CGXUI_VIEW, S.view);

    // ✅ Highlights-only: clear modebar on non-highlights views (tab will render it when needed)
    const modebarEl = S.panelEl ? S.panelEl.querySelector(`[${ATTR_DPANEL_CGXUI}="${UI_DPANEL_MODEBAR}"]`) : null;
    if (modebarEl && S.view !== 'highlights') { modebarEl.innerHTML = ''; }
    CORE_DP_syncHeaderForView();
  }

  /** @helper Open panel (panel first, sidebar delayed). */
  function UI_DPANEL_openPanel() {
    UI_DPANEL_ensurePanel();

    UI_DP_nativeClose_sync();

    if (S.panelEl) S.panelEl.setAttribute(ATTR_DPANEL_CGXUI_STATE, 'open');
    S.isOpen = true;

    STORE_DP_savePanelState({ open: true });
    CORE_DP_requestRender();
    UI_DPANEL_applyPanelBg(S.bg);

    UI_DP_alignPanelToSidebar();

    if (!UI_DP_isSidebarExpandedNow()) {
      setTimeout(() => {
        try { UI_DP_SidebarController.open(); } catch (_) {}
        UI_DP_alignPanelToSidebar();
        UI_DP_nativeClose_sync();
        setTimeout(UI_DP_alignPanelToSidebar, 40);
        setTimeout(UI_DP_alignPanelToSidebar, 120);
        setTimeout(UI_DP_alignPanelToSidebar, CFG_DPANEL.SIDEBAR_ANIM_MS + 10);
      }, CFG_DPANEL.OPEN_SIDEBAR_DELAY_MS);
    }

    setTimeout(UI_DP_alignPanelToSidebar, 180);
  }

  /** @helper Close panel (sidebar first, panel after). */
  function UI_DPANEL_closePanel(opts) {
    const o = opts || {};
    const skipSidebar = !!o.skipSidebar;

    UI_DPANEL_ensurePanel();

    if (!skipSidebar) {
      try { UI_DP_SidebarController.close(); } catch (_) {}
    }

    setTimeout(() => {
      if (S.panelEl) S.panelEl.setAttribute(ATTR_DPANEL_CGXUI_STATE, '');
      S.isOpen = false;
      STORE_DP_savePanelState({ open: false });
    }, CFG_DPANEL.CLOSE_PANEL_DELAY_MS);
  }

  /** @core Toggle panel (single source of truth). */
  function UI_DPANEL_togglePanel() {
    UI_DPANEL_ensurePanel();
    if (UI_DPANEL_isPanelOpen()) { UI_DPANEL_closePanel(); return; }
    UI_DPANEL_openPanel();
  }

  /* ───────────────────────────── 12) Rendering (Tab Router + Built-ins) ───────────────────────────── */

  /** @helper Schedule render. */
  function CORE_DP_scheduleRender() {
    if (!S.panelEl) return;
    if (!UI_DPANEL_isPanelOpen()) return;
    if (S.renderPending) return;

    S.renderPending = true;
    requestAnimationFrame(() => {
      S.renderPending = false;
      CORE_DP_render();
    });
  }

  /** @core Public request render. */
  function CORE_DP_requestRender() { CORE_DP_scheduleRender(); }

  /** @helper Render bookmarks. */
  function CORE_DP_renderBookmarks() {
    if (!S.listEl) return;

    const api = W.H2OBookmarks || W.HoBookmarks || null;
    const items = api?.list?.() || [];

    if (!items.length) {
      S.listEl.innerHTML = `<div class="${CSS_DPANEL_CLS_EMPTY}">No bookmarks yet. Use 🔖 under an answer.</div>`;
      return;
    }

    const html = items.map(b => {
      const rawId = b?.msgId || '';
      const msgId = UTIL_DP_normalizeMsgId(rawId);

      const safeN = (b?.pairNo != null ? b.pairNo : (b?.answerNo != null ? b.answerNo : '?'));
      const clean = UTIL_DP_cleanBookmarkSnippet(b?.snippet || '');
      const safe = UTIL_DP_escapeHtml(clean || '(no text)');
      const msgIdSafe = UTIL_DP_escapeHtml(msgId);

      return `
        <button class="${CSS_DPANEL_CLS_ROW}" ${ATTR_DPANEL_BM}="1" ${ATTR_DPANEL_MSG_ID}="${msgIdSafe}">
          <span class="${CSS_DPANEL_CLS_DOT}" style="--dot-color:#fbbf24"></span>
          <span class="${CSS_DPANEL_CLS_ROW_MAIN}">
            <span class="${CSS_DPANEL_CLS_ROW_TEXT}"><b>Answer ${safeN}</b> — ${safe}</span>
          </span>
        </button>
      `;
    }).join('');

    S.listEl.innerHTML = html;
  }

  /** @helper Render notes. */
  function CORE_DP_renderNotes() {
    if (!S.listEl) return;

    const notesAPI = W.H2ONotes || W.HoNotes || null;
    const scratch = notesAPI?.scratchGet?.() || '';

    S.listEl.innerHTML = `
      <div style="padding:10px 8px 12px">
        <div style="font-size:12px; opacity:.75; margin-bottom:8px;">Scratch</div>
        <textarea data-note-scratch="1"
          style="width:100%; min-height:88px; resize:vertical; border-radius:10px; border:1px solid rgba(148,163,184,0.22);
                 background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.88);
                 padding:10px; font-size:12px; line-height:1.35; outline:none;">${UTIL_DP_escapeHtml(scratch)}</textarea>
      </div>
    `;

    if (!S.panelEl) return;
    if (S.panelEl.getAttribute(ATTR_DPANEL_NOTES_BOUND) === '1') return;
    S.panelEl.setAttribute(ATTR_DPANEL_NOTES_BOUND, '1');

    const onInput = (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;

      const api = W.H2ONotes || W.HoNotes || null;
      if (!api) return;

      const scratchEl = t.closest?.('textarea[data-note-scratch="1"]');
      if (!scratchEl) return;

      clearTimeout(S.scratchT);
      S.scratchT = setTimeout(() => {
        try { api.scratchSet(scratchEl.value || ''); } catch (_) {}
        try { W.dispatchEvent(new Event(EV_H2O_NOTES_CHANGED)); } catch (_) {}
      }, 180);
    };

    S.panelEl.addEventListener('input', onInput, true);
    S.handlers.updateBindings.push({ el: S.panelEl, ev: 'input', fn: onInput, cap: true });
  }

  /** @critical Unified render dispatcher. */
  function CORE_DP_render() {
    if (!S.listEl) return;

    UI_DPANEL_ensurePanel();
    if (S.panelEl) S.panelEl.setAttribute(ATTR_DPANEL_CGXUI_VIEW, S.view);

    // 1) Prefer registered tabs (external modules)
    const tab = Dock.getTab?.(S.view) || Dock.tabs?.[S.view];
    if (tab?.render) {
      try {
        tab.render({
          panelEl: S.panelEl,
          listEl: S.listEl,
          view: S.view,
          state: { ...S },
          helpers: VAULT.api.getContract().helpers,
          api: VAULT.api,
        });
      } catch (e) {
        DIAG_DP_safe('render:tab:err', String(e?.stack || e));
        S.listEl.innerHTML = `<div class="${CSS_DPANEL_CLS_EMPTY}">Tab error: ${UTIL_DP_escapeHtml(String(e?.message || e))}</div>`;
      }
      return;
    }

    // 2) Built-ins
    if (S.view === 'bookmarks') { CORE_DP_renderBookmarks(); return; }
    if (S.view === 'notes')     { CORE_DP_renderNotes(); return; }

    // 3) If highlights module not loaded
    if (S.view === 'highlights') {
      S.listEl.innerHTML = `<div class="${CSS_DPANEL_CLS_EMPTY}">Highlights Tab script not loaded.</div>`;
      return;
    }

    S.listEl.innerHTML = `<div class="${CSS_DPANEL_CLS_EMPTY}">Unknown view: ${UTIL_DP_escapeHtml(S.view)}</div>`;
  }

  /* ───────────────────────────── 13) Topbar Button + Sidebar Overlay + Rail Buttons ───────────────────────────── */

  /** @helper Sidebar header element. */
  function UI_DPANEL_getSidebarHeaderEl() {
    let el = document.getElementById('sidebar-header');
    if (el) return el;

    const sidebar = UI_DP_getLeftSidebar();
    if (!sidebar) return null;

    el =
      sidebar.querySelector('[id*="sidebar-header" i]') ||
      sidebar.querySelector('[class*="sidebar-header" i]') ||
      sidebar.querySelector('.h-header-height') ||
      sidebar.querySelector('div[class*="header" i]') ||
      null;

    return el;
  }

  /** @helper Make SVG icon. */
  function UI_DPANEL_makeIcon(pathD) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.display = 'block';

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('d', pathD);
    svg.appendChild(path);
    return svg;
  }

  /** @critical Insert sidebar header center overlay button. */
  function UI_DPANEL_insertSidebarHeaderCenterOverlay() {
    const header = UI_DPANEL_getSidebarHeaderEl();
    if (!header) return;

    header.style.setProperty('position', 'relative', 'important');

    let overlay = document.getElementById(ID_DPANEL_SB_OVERLAY);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = ID_DPANEL_SB_OVERLAY;
      overlay.setAttribute(ATTR_DPANEL_CGXUI_OWNER, SkID);

      overlay.style.position = 'absolute';
      overlay.style.inset = '0';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '5';

      header.appendChild(overlay);
    }

    if (overlay.querySelector(`button[${ATTR_DPANEL_SB_OPEN}="1"]`)) return;

    overlay.textContent = '';

    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.gap = '8px';
    wrap.style.pointerEvents = 'auto';

    const btnCls =
      'h2o-sb-center-btn text-token-text-tertiary no-draggable hover:bg-token-surface-hover keyboard-focused:bg-token-surface-hover ' +
      'touch:h-10 touch:w-10 flex h-9 w-9 items-center justify-center rounded-lg focus:outline-none disabled:opacity-50';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.setAttribute(ATTR_DPANEL_SB_OPEN, '1');
    openBtn.setAttribute(ATTR_DPANEL_ARIA_LABEL, 'Open H2O Panel');
    openBtn.className = btnCls;
    openBtn.style.pointerEvents = 'auto';
    openBtn.appendChild(UI_DPANEL_makeIcon('M12 2a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V3a1 1 0 0 1 1-1z'));

    const onOpen = (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { UI_DP_SidebarController.open(); } catch (_) {}
      UI_DPANEL_openPanel();
    };

    openBtn.addEventListener('click', onOpen, true);
    S.handlers.updateBindings.push({ el: openBtn, ev: 'click', fn: onOpen, cap: true });

    wrap.appendChild(openBtn);
    overlay.appendChild(wrap);
  }

  /** @helper Remove existing Dock rail buttons (owned). */
    /** @helper Remove existing Dock rail buttons (owned) — but DO NOT thrash the rail. */
  function UI_DPANEL_clearRailButtons() {
    const railId = String(SEL_DPANEL.SB_TINY_RAIL || '').replace(/^#/, '');
    const rail = railId ? document.getElementById(railId) : null;
    if (!rail) return;

    // ✅ Only touch our own wrappers (never nuke the whole rail)
    const ownedWrapSel = `div[data-state][${ATTR_DPANEL_CGXUI_OWNER}="${SkID}"][${ATTR_DPANEL_RAIL_VIEW}]`;
    const wraps = Array.from(rail.querySelectorAll(ownedWrapSel));

    // ✅ De-dupe by view; keep the first instance (prevents blink/DevTools flashing)
    const seen = new Set();
    for (const w of wraps) {
      const v = String(w.getAttribute(ATTR_DPANEL_RAIL_VIEW) || '');
      if (!v) { try { w.remove(); } catch (_) {} ; continue; }
      if (seen.has(v)) { try { w.remove(); } catch (_) {} ; continue; }
      seen.add(v);
    }
  }

  /** @helper Rail visible check. */
  function UI_DPANEL_ensureRailVisible(rail) {
    if (!rail) return false;
    const rr = rail.getBoundingClientRect();
    if (rr.width < 30 || rr.height < 200) return false;
    return true;
  }

  /** @helper Toggle by view (rail UX). */
  function UI_DPANEL_toggleByView(viewId) {
    const v = String(viewId || '');
    if (!v) return;

    if (S.isOpen && S.view === v) { UI_DPANEL_closePanel(); return; }

    CORE_DP_setView(v);
    // ✅ Rail buttons often exist when the ChatGPT sidebar is collapsed; open it before docking.
    try { UI_DP_SidebarController.open(); } catch (_) {}
    UI_DPANEL_openPanel();

    UI_DP_alignPanelToSidebar();
    setTimeout(UI_DP_alignPanelToSidebar, 60);
    setTimeout(UI_DP_alignPanelToSidebar, 140);
    setTimeout(UI_DP_alignPanelToSidebar, 260);
    setTimeout(UI_DP_alignPanelToSidebar, 420);
  }

  /** @helper Schedule rail refresh (RAF coalesced). */
  function UI_DPANEL_scheduleRailEnsure() {
    if (S.railRAF) return;
    S.railRAF = requestAnimationFrame(() => {
      S.railRAF = 0;
      try { UI_DPANEL_installRailButtons(); } catch (_) {}
      try { CORE_DP_bindRailObserversOnce();
        CORE_DP_bindRailDelegationOnce(); } catch (_) {}
    });
  }

  /** @core Bind observers so rail buttons appear whenever the sidebar rail appears. */
  function CORE_DP_bindRailObserversOnce() {
    if (S.moRail) return;

    if (!S.handlers.onResize) {
      S.handlers.onResize = () => UI_DPANEL_scheduleRailEnsure();
      W.addEventListener('resize', S.handlers.onResize);
    }
    if (!S.handlers.onPopState) {
      S.handlers.onPopState = () => UI_DPANEL_scheduleRailEnsure();
      W.addEventListener('popstate', S.handlers.onPopState);
    }

    if (typeof MutationObserver !== 'function') return;

    S.moRail = new MutationObserver(() => {
      UI_DPANEL_scheduleRailEnsure();
      try { UI_DP_nativeClose_sync(); } catch (_) {}
    });
    S.moRail.observe(document.documentElement, { childList: true, subtree: true });

    UI_DPANEL_scheduleRailEnsure();
  }



/** @helper Resolve rail button element from an event (handles shadow DOM). */
function CORE_DP_getRailTarget(ev) {
  const attr = ATTR_DPANEL_RAIL_VIEW;
  const t = ev?.target;
  let el = t?.closest?.(`[${attr}]`);
  if (!el && typeof ev?.composedPath === 'function') {
    for (const n of ev.composedPath()) {
      if (n?.getAttribute?.(attr)) { el = n; break; }
    }
  }
  return el || null;
}

/** @helper Handle rail activation. */
function CORE_DP_handleRailEvent(ev, reason) {
  if (!ev) return;
  if (ev.__h2oRailHandled) return;

  const el = CORE_DP_getRailTarget(ev);
  if (!el) return;

  // Only handle from collapsed tiny rail (right rail).
  if (!el.closest?.(SEL_DPANEL.SB_TINY_RAIL)) return;

  const view = String(el.getAttribute(ATTR_DPANEL_RAIL_VIEW) || '').trim();
  if (!view) return;
  if (el.getAttribute(ATTR_DPANEL_RAIL_DUMMY) === '1') return;

  try { ev.preventDefault?.(); } catch {}
  try { ev.stopPropagation?.(); } catch {}
  try { ev.stopImmediatePropagation?.(); } catch {}

  ev.__h2oRailHandled = true;
  UI_DPANEL_toggleByView(view);
}

/** @critical Capture rail clicks even if ChatGPT stops propagation. */
function CORE_DP_bindRailDelegationOnce(){
  if (S.didBindRailDelegation) return;
  S.didBindRailDelegation = true;

  const onClick = (ev) => {
    CORE_DP_handleRailEvent(ev, 'rail-delegation');
  };

  const onKey = (ev) => {
    if (ev?.key !== 'Enter' && ev?.key !== ' ') return;
    CORE_DP_handleRailEvent(ev, 'rail-delegation-kbd');
  };

  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);

  S.handlers.updateBindings.push({ el: document, ev: 'click', fn: onClick, cap: true });
  S.handlers.updateBindings.push({ el: document, ev: 'keydown', fn: onKey, cap: true });
}

/** @critical Install Dock buttons into the collapsed sidebar rail. */
  /** @critical Install Dock buttons into the collapsed sidebar rail. */
  function UI_DPANEL_installRailButtons() {
    const rail = document.querySelector(SEL_DPANEL.SB_TINY_RAIL);
    if (!rail) return;
    if (!UI_DPANEL_ensureRailVisible(rail)) return;

    // ✅ Hard throttle: avoid rail thrash (React re-renders can trigger many mutations per second)
    const now = Date.now();
    if (S._railEnsureAt && (now - S._railEnsureAt) < 180) return;
    S._railEnsureAt = now;

    // Ensure capture delegation on the rail itself (resilient vs stopPropagation)
    if (!rail.getAttribute('data-h2o-rail-delegation')) {
      const onRailClick = (ev) => CORE_DP_handleRailEvent(ev, 'rail-delegation-local');
      rail.addEventListener('click', onRailClick, true);
      rail.addEventListener('keydown', (ev) => CORE_DP_handleRailEvent(ev, 'rail-delegation-local-kbd'), true);
      rail.setAttribute('data-h2o-rail-delegation', '1');
      S.handlers.updateBindings.push({ el: rail, ev: 'click', fn: onRailClick, cap: true });
    }

    const stack =
      rail.querySelector(SEL_DPANEL.SB_TINY_STACK_PRIMARY) ||
      rail.querySelector(SEL_DPANEL.SB_TINY_STACK_FALLBACK) ||
      rail;
    if (!stack) return;

    // ✅ Find a REAL native wrapper to clone (preserves hover "pill" + spacing)
    const nativeWrapSel = `div[data-state]:not([${ATTR_DPANEL_CGXUI_OWNER}="${SkID}"])`;
    const templateWrap =
      stack.querySelector(nativeWrapSel) ||
      stack.querySelector('div[data-state]') ||
      stack.querySelector(':scope > div') ||
      null;

    const templateA =
      templateWrap?.querySelector?.(SEL_DPANEL.SB_TINY_ITEM_A) ||
      stack.querySelector(SEL_DPANEL.SB_TINY_ITEM_A) ||
      null;

    if (!templateA) return;

    // Compute intended size from native icon host
    const templateIconHost = templateA.querySelector(SEL_DPANEL.SB_TINY_ICON_HOST) || templateA;
    const r = templateIconHost.getBoundingClientRect();
    const railW = Math.max(18, Math.round(r.width || 24));
    const railH = Math.max(18, Math.round(r.height || 24));

    // ✅ Clean only our duplicates (never clear everything)
    UI_DPANEL_clearRailButtons();

    // Ensure we have 8 items (3 real + 5 dummy)
    const items = Array.isArray(DPANEL_RAIL_ITEMS) ? DPANEL_RAIL_ITEMS.slice(0) : [];
    while (items.length < 8) items.push({ view:`dummy${items.length+1}`, title:`Dummy ${items.length+1}`, color:'#3a3a3a', dummy:true });

    const ownedWrapSel = `div[data-state][${ATTR_DPANEL_CGXUI_OWNER}="${SkID}"][${ATTR_DPANEL_RAIL_VIEW}]`;

    for (const item of items) {
      const viewId = String(item.view || '').trim();
      if (!viewId) continue;

      // Already exists? (ours)
      if (stack.querySelector(`${ownedWrapSel}[${ATTR_DPANEL_RAIL_VIEW}="${viewId}"]`)) continue;

      // ✅ Clone wrapper if possible; else create the minimal wrapper
      const wrap = templateWrap ? templateWrap.cloneNode(true) : document.createElement('div');
      wrap.setAttribute('data-state', wrap.getAttribute('data-state') || 'closed');
      wrap.setAttribute(ATTR_DPANEL_RAIL_VIEW, viewId);
      wrap.setAttribute(ATTR_DPANEL_CGXUI_OWNER, SkID);
      if (item.dummy) wrap.setAttribute(ATTR_DPANEL_RAIL_DUMMY, '1');
      else wrap.removeAttribute?.(ATTR_DPANEL_RAIL_DUMMY);

      // Find (or create) the anchor inside the wrapper
      let a = wrap.querySelector?.(SEL_DPANEL.SB_TINY_ITEM_A);
      if (!a) {
        a = templateA.cloneNode(true);
        wrap.textContent = '';
        wrap.appendChild(a);
      }

      // Make it a button (not navigation)
      try { a.removeAttribute('href'); } catch (_) {}
      try { a.removeAttribute('data-testid'); } catch (_) {}
      a.setAttribute(ATTR_DPANEL_RAIL_VIEW, viewId);
      a.setAttribute(ATTR_DPANEL_CGXUI_OWNER, SkID);
      a.setAttribute('role', 'button');
      a.setAttribute('tabindex', '0');
      a.setAttribute('data-sidebar-item', 'true');
      a.setAttribute('title', item.title || viewId);
      if (item.dummy) a.setAttribute(ATTR_DPANEL_RAIL_DUMMY, '1');
      else a.removeAttribute?.(ATTR_DPANEL_RAIL_DUMMY);

      // Replace icon with our lightweight badge
      const iconHost = a.querySelector(SEL_DPANEL.SB_TINY_ICON_HOST) || a;
      iconHost.style.display = 'flex';
      iconHost.style.alignItems = 'center';
      iconHost.style.justifyContent = 'center';

      const bg = item.color || '#777';
      const txt = item.txt || '';

      iconHost.innerHTML = `
        <span class="cgxui-${SkID}-rail-nav-btn" aria-hidden="true"
          style="--cgxui-btn-bg:${bg}; --cgxui-rail-btn-w:${railW}px; --cgxui-rail-btn-h:${railH}px;">
          ${txt ? `<span class="cgxui-${SkID}-rail-nav-txt">${txt}</span>` : ``}
        </span>
      `;

      // ✅ Prevent the rail "resize/drag" cursor from stealing the click (key for reliability)
      const stop = (e) => { try { e.preventDefault(); } catch (_) {} try { e.stopPropagation(); } catch (_) {} };
      a.addEventListener('pointerdown', stop, true);
      a.addEventListener('mousedown', stop, true);

      // ✅ Main activation
      const handleRailBtn = (ev) => CORE_DP_handleRailEvent(ev, `rail-btn:${viewId}`);
      const handleRailKey = (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        handleRailBtn(e);
      };

      a.addEventListener('click', handleRailBtn, true);
      a.addEventListener('keydown', handleRailKey, true);

      S.handlers.updateBindings.push({ el: a, ev: 'click', fn: handleRailBtn, cap: true });
      S.handlers.updateBindings.push({ el: a, ev: 'keydown', fn: handleRailKey, cap: true });

      // ✅ Ensure wrapper contains the anchor (some clones may contain extra nodes)
      if (!wrap.contains(a)) { wrap.textContent = ''; wrap.appendChild(a); }

      stack.appendChild(wrap);
    }
  }

  /* ───────────────────────────── 14) Reinsertion MO ───────────────────────────── */

  function CORE_DP_missingUI() {
    return !document.getElementById(ID_DPANEL_SB_OVERLAY);
  }

  function CORE_DP_scheduleReinsert() {
    const kUiSafe = `${NS_MEM_GUARD}:uiSafe`;
    if (!W[kUiSafe]) return;
    if (S.reinsertT) return;

    S.reinsertT = setTimeout(() => {
      S.reinsertT = 0;
      if (!W[kUiSafe]) return;

      if (!document.getElementById(ID_DPANEL_SB_OVERLAY)) {
        try { UI_DPANEL_insertSidebarHeaderCenterOverlay(); } catch (e) { DIAG_DP_safe('reinsert:sboverlay:err', String(e?.stack || e)); }
      }
    }, CFG_DPANEL.REINSERT_DELAY_MS);
  }

  function CORE_DP_ensureRootMO() {
    if (S.moRoot) return;
    if (typeof MutationObserver !== 'function') { DIAG_DP_safe('mo:missing', navigator.userAgent); return; }

    try {
      S.moRoot = new MutationObserver(() => {
        try {
          if (!CORE_DP_missingUI()) return;
          CORE_DP_scheduleReinsert();
        } catch (e) {
          DIAG_DP_safe('mo:cb:err', String(e?.stack || e));
        }
      });

      S.moRoot.observe(document.documentElement, { childList: true, subtree: true });
      DIAG_DP_safe('mo:ok', { ok: true });
    } catch (e) {
      DIAG_DP_safe('mo:create:err', String(e?.stack || e));
      S.moRoot = null;
    }
  }

  /* ───────────────────────────── 15) Retry Guards ───────────────────────────── */

  function CORE_DP_panelRetry(fn) {
    if (S.retryPanelT) return;
    S.retryPanelT = setTimeout(() => {
      S.retryPanelT = 0;
      try { fn(); } catch (_) {}
    }, CFG_DPANEL.RETRY_DELAY_MS);
  }

  /* ───────────────────────────── 16) UI-safe defer ───────────────────────────── */

  function CORE_DP_whenUiSafe(fn) {
    const kUiSafe = `${NS_MEM_GUARD}:uiSafe`;

    const run = () => {
      const exec = () => {
        W[kUiSafe] = true;
        try { fn(); } catch (_) {}
      };
      UTIL_DP_idle(exec, 1200);
    };

    if (document.readyState === 'complete') run();
    else {
      const onLoad = () => run();
      S.handlers.onLoad = onLoad;
      W.addEventListener('load', onLoad, { once: true });
    }
  }

  /* ───────────────────────────── 17) Click Router (tab-aware) ───────────────────────────── */

  function CORE_DP_onClick(e) {
    const target = e.target;
    if (!(target instanceof Element)) return;

    // close dropdown on outside click
    const dd = S.panelEl?.querySelector?.(`[${ATTR_DPANEL_VIEW_DD}="1"]`);
    if (dd && dd.getAttribute(ATTR_DPANEL_CGXUI_STATE) === 'open') {
      const inside = target.closest?.(`[${ATTR_DPANEL_VIEW_DD}="1"]`);
      if (!inside) {
        dd.setAttribute(ATTR_DPANEL_CGXUI_STATE, '');
        const menu = dd.querySelector(`[${ATTR_DPANEL_VIEW_MENU}="1"]`);
        if (menu) menu.setAttribute('aria-hidden', 'true');
      }
    }

    // title click -> toggle dropdown
    const titleBtn = target.closest?.(`button[${ATTR_DPANEL_TITLE_BTN}="1"]`);
    if (titleBtn && S.panelEl && S.panelEl.contains(titleBtn)) {
      e.preventDefault();
      const dd2 = titleBtn.closest?.(`[${ATTR_DPANEL_VIEW_DD}="1"]`);
      if (!dd2) return;

      const nowOpen = (dd2.getAttribute(ATTR_DPANEL_CGXUI_STATE) !== 'open');
      dd2.setAttribute(ATTR_DPANEL_CGXUI_STATE, nowOpen ? 'open' : '');
      const menu = dd2.querySelector(`[${ATTR_DPANEL_VIEW_MENU}="1"]`);
      if (menu) menu.setAttribute('aria-hidden', nowOpen ? 'false' : 'true');

      DOM_DP_qa(`.${CSS_DPANEL_CLS_MENU_ITEM}`, dd2).forEach(b => {
        const isActive = (b.getAttribute(ATTR_DPANEL_SET_VIEW) === S.view);
        b.setAttribute(ATTR_DPANEL_CGXUI_STATE, isActive ? 'active' : '');
      });
      return;
    }

    // dropdown item -> set view
    const viewItem = target.closest?.(`button[${ATTR_DPANEL_SET_VIEW}]`);
    if (viewItem && S.panelEl && S.panelEl.contains(viewItem)) {
      e.preventDefault();
      const next = viewItem.getAttribute(ATTR_DPANEL_SET_VIEW);
      if (!next) return;

      CORE_DP_setView(next);

      const dd2 = viewItem.closest?.(`[${ATTR_DPANEL_VIEW_DD}="1"]`);
      if (dd2) {
        dd2.setAttribute(ATTR_DPANEL_CGXUI_STATE, '');
        const menu = dd2.querySelector(`[${ATTR_DPANEL_VIEW_MENU}="1"]`);
        if (menu) menu.setAttribute('aria-hidden', 'true');
      }

      CORE_DP_requestRender();
      return;
    }

    // close button
    const closeBtn = target.closest?.(`.${CSS_DPANEL_CLS_CLOSE_BTN}`);
    if (closeBtn && S.panelEl && S.panelEl.contains(closeBtn)) {
      e.preventDefault();
      e.stopPropagation();
      UI_DPANEL_closePanel();
      return;
    }

    // bg buttons
    const bgBtn = target.closest?.(`button[${ATTR_DPANEL_BG}]`);
    if (bgBtn && S.panelEl && S.panelEl.contains(bgBtn)) {
      e.preventDefault();
      const mode = bgBtn.getAttribute(ATTR_DPANEL_BG);
      if (!mode) return;
      UI_DPANEL_applyPanelBg(mode);
      return;
    }

    // mode buttons
    const modeBtn = target.closest?.(`button[${ATTR_DPANEL_MODE}]`);
    if (modeBtn && S.panelEl && S.panelEl.contains(modeBtn)) {
      e.preventDefault();
      const m = modeBtn.getAttribute(ATTR_DPANEL_MODE);
      if (!m) return;

      S.mode = (m === 'color') ? 'color' : 'answer';
      STORE_DP_savePanelState({ mode: S.mode });

      DOM_DP_qa(`button[${ATTR_DPANEL_MODE}]`, S.panelEl).forEach(b => {
        b.setAttribute(ATTR_DPANEL_CGXUI_STATE, (b.getAttribute(ATTR_DPANEL_MODE) === S.mode) ? 'active' : '');
      });

      CORE_DP_requestRender();
      return;
    }

    // arrange buttons
    const arrBtn = target.closest?.(`button[${ATTR_DPANEL_ARRANGE}]`);
    if (arrBtn && S.panelEl && S.panelEl.contains(arrBtn)) {
      e.preventDefault();
      const a = arrBtn.getAttribute(ATTR_DPANEL_ARRANGE);
      if (!a) return;

      S.arrange = (a === 'color') ? 'color' : 'order';
      STORE_DP_savePanelState({ arrange: S.arrange });

      DOM_DP_qa(`button[${ATTR_DPANEL_ARRANGE}]`, S.panelEl).forEach(b => {
        b.setAttribute(ATTR_DPANEL_CGXUI_STATE, (b.getAttribute(ATTR_DPANEL_ARRANGE) === S.arrange) ? 'active' : '');
      });

      CORE_DP_requestRender();
      return;
    }

    // section collapse toggle
    const secTitle = target.closest?.(`.${CSS_DPANEL_CLS_SEC_TITLE}`);
    if (secTitle && S.panelEl && S.panelEl.contains(secTitle)) {
      e.preventDefault();
      const sec = secTitle.closest?.(`.${CSS_DPANEL_CLS_SEC}`);
      if (!sec) return;

      const collapsed = (sec.getAttribute(ATTR_DPANEL_COLLAPSED) === 'true');
      sec.setAttribute(ATTR_DPANEL_COLLAPSED, collapsed ? 'false' : 'true');

      const kids = Array.from(sec.children).slice(1);
      kids.forEach(k => { k.style.display = collapsed ? '' : 'none'; });

      const chev = secTitle.querySelector(`.${CSS_DPANEL_CLS_CHEVRON}`);
      if (chev) chev.textContent = collapsed ? '▾' : '▸';
      return;
    }

    // row click (bookmarks OR delegate to active tab)
    const row = target.closest?.(`.${CSS_DPANEL_CLS_ROW}`);
    if (row && S.panelEl && S.panelEl.contains(row)) {
      e.preventDefault();
      e.stopPropagation();

      // bookmark row
      if (row.getAttribute(ATTR_DPANEL_BM) === '1') {
        const msgId = row.getAttribute(ATTR_DPANEL_MSG_ID);
        const api = W.H2OBookmarks || W.HoBookmarks || null;

        try {
          if (api?.scrollToMessageById && msgId) { api.scrollToMessageById(msgId); return; }
        } catch (_) {}

        if (msgId) {
          const esc = (W.CSS && CSS.escape) ? CSS.escape(msgId) : msgId;
          const host = document.querySelector(UTIL_DP_selConversationTurnByEsc(esc));
          const msgEl = host?.closest?.(SEL_DPANEL.MSG_ANY) || host;
          if (msgEl) msgEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        return;
      }

      // delegate to current tab
      const tab = Dock.getTab?.(S.view) || Dock.tabs?.[S.view];
      if (tab?.onRowClick) {
        try {
          tab.onRowClick({
            rowEl: row,
            panelEl: S.panelEl,
            listEl: S.listEl,
            view: S.view,
            state: { ...S },
            helpers: VAULT.api.getContract().helpers,
            api: VAULT.api,
          });
          return;
        } catch (e2) {
          DIAG_DP_safe('tab:onRowClick:err', String(e2?.stack || e2));
        }
      }
    }
  }

  /* ───────────────────────────── 18) Update Events Bridge ───────────────────────────── */

  function CORE_DP_bindUpdateEventsOnce() {
    const k = `${NS_MEM_ONCE}:updateEvents`;
    if (W[k]) return;
    W[k] = 1;

    const rerender = () => CORE_DP_scheduleRender();
    const add = (ev) => {
      try { W.addEventListener(ev, rerender); } catch (_) {}
      S.handlers.updateBindings.push({ el: W, ev, fn: rerender, cap: false });
    };

    add(EV_H2O_INDEX_UPDATED);
    add(EV_H2O_BOOKMARKS_CHANGED);
    add(EV_H2O_NOTES_CHANGED);
    add(EV_H2O_INLINE_CHANGED);
    add(EV_H2O_MSG_REMOUNTED);

    add(EV_LEG_BOOKMARKS_CHANGED_1);
    add(EV_LEG_BOOKMARKS_CHANGED_2);
    add(EV_LEG_NOTES_CHANGED_1);
    add(EV_LEG_NOTES_CHANGED_2);
    add(EV_LEG_INLINE_CHANGED);
    add(EV_LEG_MSG_REMOUNTED);
  }

  /* ───────────────────────────── 19) Public API (contract handoff) ───────────────────────────── */

  VAULT.api = VAULT.api || {};

  /** @core Contract export for external tabs. */
  VAULT.api.getContract = VAULT.api.getContract || function getContract() {
    return Object.freeze({
      ident: Object.freeze({ TOK, PID, CID, SkID, SUITE, HOST, DsID, BrID, MODTAG, MODICON, EMOJI_HDR }),
      disk: Object.freeze({ NS_DISK, KEY_DPANEL_STATE_PANEL_V1, KEY_DPANEL_MIG_STATE_V1 }),
      events: Object.freeze({
        EV_DPANEL_TABS, EV_DPANEL_READY,
        EV_H2O_INDEX_UPDATED, EV_H2O_BOOKMARKS_CHANGED, EV_H2O_NOTES_CHANGED, EV_H2O_INLINE_CHANGED,
        EV_H2O_MSG_REMOUNTED, EV_H2O_MSG_MOUNT_REQUEST,
        EV_LEG_BOOKMARKS_CHANGED_1, EV_LEG_BOOKMARKS_CHANGED_2,
        EV_LEG_NOTES_CHANGED_1, EV_LEG_NOTES_CHANGED_2,
        EV_LEG_INLINE_CHANGED, EV_LEG_MSG_REMOUNTED,
      }),
      attr: Object.freeze({
        ATTR_DPANEL_CGXUI, ATTR_DPANEL_CGXUI_OWNER, ATTR_DPANEL_CGXUI_STATE, ATTR_DPANEL_CGXUI_VIEW,
        ATTR_DPANEL_TESTID, ATTR_DPANEL_ARIA_LABEL, ATTR_DPANEL_MSG_ROLE,
        ATTR_DPANEL_HL_ID, ATTR_DPANEL_MSG_ID, ATTR_DPANEL_BM,
        ATTR_DPANEL_BG, ATTR_DPANEL_MODE, ATTR_DPANEL_ARRANGE, ATTR_DPANEL_COLLAPSED,
      }),
      ui: Object.freeze({
        UI_DPANEL_PANEL, UI_DPANEL_LIST, UI_DPANEL_MODEBAR,
        CSS_DPANEL_CLS_MODEBAR, CSS_DPANEL_CLS_BLOCK, CSS_DPANEL_CLS_LABEL, CSS_DPANEL_CLS_PILL,
        CSS_DPANEL_CLS_ROW, CSS_DPANEL_CLS_DOT, CSS_DPANEL_CLS_ROW_MAIN, CSS_DPANEL_CLS_ROW_TEXT,
        CSS_DPANEL_CLS_SEC, CSS_DPANEL_CLS_SEC_TITLE, CSS_DPANEL_CLS_CHEVRON,
        CSS_DPANEL_CLS_SUMMARY, CSS_DPANEL_CLS_SUM_ITEM,
        CSS_DPANEL_CLS_EMPTY,
        ID_DPANEL_PING,
      }),
      sel: SEL_DPANEL,
      cfg: CFG_DPANEL,
      helpers: Object.freeze({
        q: DOM_DP_q,
        qa: DOM_DP_qa,
        isVisible: DOM_DP_isVisible,
        escapeHtml: UTIL_DP_escapeHtml,
        lsGet: UTIL_DP_lsGet,
        lsSet: UTIL_DP_lsSet,
        jsonParse: UTIL_DP_jsonParse,
        normalizeMsgId: UTIL_DP_normalizeMsgId,
        selConversationTurnByEsc: UTIL_DP_selConversationTurnByEsc,
        requestRemountByMsgId: CORE_DP_requestRemountByMsgId,
        diagSafe: DIAG_DP_safe,
      }),
    });
  };

  VAULT.api.getState = VAULT.api.getState || (() => ({ ...S }));
  VAULT.api.getView  = VAULT.api.getView  || (() => String(S.view || 'highlights'));
  VAULT.api.setView  = VAULT.api.setView  || ((v) => { CORE_DP_setView(v); CORE_DP_requestRender(); });
  VAULT.api.open     = VAULT.api.open     || (() => UI_DPANEL_openPanel());
  VAULT.api.close    = VAULT.api.close    || (() => UI_DPANEL_closePanel());
  VAULT.api.toggle   = VAULT.api.toggle   || (() => UI_DPANEL_togglePanel());
  VAULT.api.requestRender = VAULT.api.requestRender || (() => CORE_DP_requestRender());
  VAULT.api.ensurePanel   = VAULT.api.ensurePanel   || (() => UI_DPANEL_ensurePanel());

  /* ───────────────────────────── 20) Boot ───────────────────────────── */

  function CORE_DP_boot() {
    if (STATE_DPANEL.booted) return;
    STATE_DPANEL.booted = true;

    try {
      VAULT.diag.bootCount++;
      VAULT.diag.lastBootAt = Date.now();
      DIAG_DP_safe('boot:start', { ready: document.readyState, url: location.href });

      const kBoot = `${NS_MEM_GUARD}:booted`;
      if (W[kBoot]) return;
      W[kBoot] = 1;

      CORE_DP_installCrashHooksOnce();
      UI_DP_injectStylesOnce();

      const st = STORE_DP_loadPanelState();
      S.bg      = st.bg || 'bar';
      S.view    = st.view || 'highlights';
      S.mode    = st.mode || 'answer';
      S.arrange = st.arrange || 'order';

      CORE_DP_whenUiSafe(() => {
        DIAG_DP_safe('boot:ui:safe', null);

        try { UI_DPANEL_insertSidebarHeaderCenterOverlay(); } catch (e) { DIAG_DP_safe('boot:sboverlay:err', String(e?.stack || e)); }
        try { UI_DPANEL_installRailButtons(); } catch (e) { DIAG_DP_safe('boot:rail:err', String(e?.stack || e)); }

        UI_DPANEL_ensurePanel();
        CORE_DP_setView(S.view);

        DOM_DP_qa(`button[${ATTR_DPANEL_MODE}]`, S.panelEl).forEach(b => {
          b.setAttribute(ATTR_DPANEL_CGXUI_STATE, (b.getAttribute(ATTR_DPANEL_MODE) === S.mode) ? 'active' : '');
        });
        DOM_DP_qa(`button[${ATTR_DPANEL_ARRANGE}]`, S.panelEl).forEach(b => {
          b.setAttribute(ATTR_DPANEL_CGXUI_STATE, (b.getAttribute(ATTR_DPANEL_ARRANGE) === S.arrange) ? 'active' : '');
        });

        UI_DPANEL_applyPanelBg(S.bg);

        if (!S.handlers.onClick) {
          S.handlers.onClick = CORE_DP_onClick;
          document.addEventListener('click', CORE_DP_onClick, true);
        }

        CORE_DP_bindUpdateEventsOnce();
        CORE_DP_ensureRootMO();
        CORE_DP_bindRailObserversOnce();

        try { W.dispatchEvent(new Event(EV_DPANEL_READY)); } catch (_) {}
        DIAG_DP_safe('boot:done', { view: S.view });

        // Auto-open if persisted open
        if (st.open) UI_DPANEL_openPanel();
      });
    } catch (e) {
      VAULT.diag.lastError = String(e?.stack || e);
      DIAG_DP_safe('boot:fatal', VAULT.diag.lastError);
    }
  }

  CORE_DP_boot();
})();
