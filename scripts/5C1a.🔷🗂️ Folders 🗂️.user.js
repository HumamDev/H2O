// ==UserScript==
// @h2o-id             5c1a.folders
// @name               5C1a.🔷🗂️ Folders 🗂️
// @namespace          H2O.Premium.CGX.folders
// @author             HumamDev
// @version            0.5.0
// @revision           002
// @build              260305-000000
// @description        Folders section independent from Projects + icons always visible + safe observers (no crash).
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* ───────────────────────────── ⬜️ DEFINE — META / BOOTSTRAP 📄🔒💧 ───────────────────────────── */
  const W = window;
  const D = document;

  // ✅ IDENTITY (chosen deterministically for this file; do NOT change unless you migrate UI/storage contracts)
  // Title basis: "Folders Section" → TOK=FS, CID=FSECTION, SkID=flsc
  const TOK  = 'FS';             // "Folders Section"
  const PID  = 'fldrs';          // canonical anchor (consonant-only)
  const BrID = PID;              // Brain vault key
  const DsID = PID;              // Disk namespace id
  const SkID = 'flsc';           // Skin/UI identity (cgxui-* and data-cgxui-owner ALWAYS = SkID)
  const CID  = 'fsection';       // identifiers only

  // labels only (NOT identity)
  const MODTAG = 'Folders';
  const MODICON = '🗂️';
  const EMOJI_HDR = 'OFF';
  const SUITE = 'prm';
  const HOST  = 'cgx';

  // Derived (identifiers only)
  const PID_UP = PID.toUpperCase();
  const CID_UP = CID.toUpperCase();

  // Runtime vault
  const H2O = (W.H2O = W.H2O || {});
  const MOD = ((H2O[TOK] = H2O[TOK] || {})[BrID] = (H2O[TOK][BrID] || {}));

  MOD.meta = MOD.meta || {
    tok: TOK, pid: PID, brid: BrID, dsid: DsID, skid: SkID, cid: CID_UP,
    modtag: MODTAG, suite: SUITE, host: HOST
  };

  // ✅ DIAG (bounded)
  MOD.diag = MOD.diag || { t0: performance.now(), steps: [], errors: [], bufMax: 160, errMax: 30 };
  const DIAG = MOD.diag;
  const DIAG_step = (s, o) => {
    try {
      const a = DIAG.steps; a.push({ t: Math.round(performance.now() - DIAG.t0), s, o: o ? String(o) : '' });
      if (a.length > DIAG.bufMax) a.splice(0, a.length - DIAG.bufMax);
    } catch {}
  };
  const DIAG_err = (s, e) => {
    try {
      const a = DIAG.errors; a.push({ t: Math.round(performance.now() - DIAG.t0), s, e: String(e?.stack || e) });
      if (a.length > DIAG.errMax) a.splice(0, a.length - DIAG.errMax);
    } catch {}
  };

  // Ecosystem registries (MODE B: warn + keep first; do NOT freeze here)
  H2O.KEYS = H2O.KEYS || {};
  H2O.EV   = H2O.EV   || {};
  H2O.SEL  = H2O.SEL  || {};
  H2O.UI   = H2O.UI   || {};

  /* ───────────────────────────── ⬛️ DEFINE — CONFIG / CONSTANTS 📄🔒💧 ───────────────────────────── */

  /* [DEFINE][DOM] ATTR_ */
  const ATTR_CGXUI       = 'data-cgxui';
  const ATTR_CGXUI_OWNER = 'data-cgxui-owner';
  const ATTR_CGXUI_STATE = 'data-cgxui-state';

  /* [DEFINE][STORE] Namespaces */
  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`; // no trailing ":"

  /* [STORE][Folders] Canonical keys (v2 contract-aligned) */
  const KEY_FSECTION_STATE_DATA_V1 = `${NS_DISK}:state:data:v1`; // { folders:[{id,name,createdAt}], items:{[folderId]:[hrefs]} }
  const KEY_FSECTION_STATE_UI_V1   = `${NS_DISK}:state:ui:v1`;   // { openFolders:{[folderId]:bool}, foldersExpanded:bool }
  const KEY_FSECTION_STATE_SEE_V1  = `${NS_DISK}:state:see_more:v1`; // { expandedList: bool }
  const KEY_FSECTION_STATE_EXP_V1  = `${NS_DISK}:state:folders_expanded:v1`; // { expanded: bool }

  /* Legacy keys (read/bridge so nothing is lost) */
  const KEY_LEG_DATA = 'h2o:folders:data:v1';
  const KEY_LEG_UI   = 'h2o:folders:ui:v1';
  const KEY_LEG_SEE  = 'h2o:folders:seeMoreExpanded:v1'; // "1"/"0"
  const KEY_LEG_EXP  = 'h2o:folders:expanded';           // "1"/"0"

  /* UI tokens (SkID-based values) */
  const UI_FSECTION_ROOT        = `${SkID}-root`;
  const UI_FSECTION_MENU        = `${SkID}-menu`;
  const UI_FSECTION_POP         = `${SkID}-pop`;
  const UI_FSECTION_MODAL       = `${SkID}-modal`;
  const UI_FSECTION_VIEWER      = `${SkID}-viewer`;
  const UI_FSECTION_ICON_SLOT   = `${SkID}-ico-slot`;
  const UI_FSECTION_SEP         = `${SkID}-sep`;
  const UI_FSECTION_FOLDER_ROW  = `${SkID}-folder-row`;
  const UI_FSECTION_FOLDER_MORE = `${SkID}-folder-more`;

  /* CSS style id */
  const CSS_FSECTION_STYLE_ID = `cgxui-${SkID}-style`;

  /* Config */
  const CFG_FSECTION_LABEL = 'Folders';
  const CFG_PROJECTS_RE = /projects/i;

  const CFG_SEED_FOLDERS = [
    { name: 'Pinned' },
    { name: 'Study' },
    { name: 'Case' },
    { name: 'Dev' },
    { name: 'Archive' },
  ];

  const CFG_SEE_MORE_LIMIT = 7;
  const CFG_ASSIGN_ONE_FOLDER_MAX = true; // keep your intended behavior: one-folder max

  /* Icons (trusted strings, controlled) */
  const FRAG_SVG_FOLDER = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z"
            fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>
  `;
  const FRAG_SVG_ADD = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z"
            fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M12 11v6M9 14h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;
  const FRAG_SVG_MORE = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 10h12M6 14h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  /* ───────────────────────────── 🟩 TOOLS — UTILITIES 📄🔓💧 ───────────────────────────── */

  const UTIL_uid = () => `f_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  const UTIL_normText = (s) => (s || '').trim().replace(/\s+/g, ' ');
  const UTIL_escHtml = (s) => (s || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));

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

  const UTIL_selScoped = (uiTok) => `[${ATTR_CGXUI}="${uiTok}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;

  /* ───────────────────────────── 🔴 STATE — REGISTRIES / CACHES 📄🔓💧 ───────────────────────────── */

  const STATE = MOD.state = MOD.state || {};
  STATE.booted = !!STATE.booted;

  // cleanup buckets
  const CLEAN = STATE.clean = STATE.clean || { timers: new Set(), observers: new Set(), listeners: new Set(), nodes: new Set() };

  // menu capture
  STATE.lastChatHrefForMenu = STATE.lastChatHrefForMenu || '';

  // active UI elements (owned)
  STATE.menuEl = null;  // assign menu
  STATE.popEl  = null;  // folder row pop
  STATE.viewerEl = null;

  // injection observer
  STATE.sidebarMO = null;
  STATE.menuMO = null;
  STATE.retryTimer = 0;
  STATE.ensureTimer = 0;
  STATE.building = false;
  STATE.suppressMO = false;
  STATE.observedRoot = null;

  /* ───────────────────────────── 🟫 VERIFY/SAFETY — HARDENING 📝🔓💧 ───────────────────────────── */

  const SAFE_try = (label, fn) => {
    try { return fn(); }
    catch (e) { DIAG_err(label, e); return null; }
  };

  const SAFE_isEl = (x) => (x && typeof x === 'object' && x.nodeType === 1);
  const SAFE_remove = (node) => { try { node?.remove?.(); } catch {} };

  /* ───────────────────────────── 🟧 BOUNDARIES — DOM / IO ADAPTERS 📝🔓💥 ───────────────────────────── */

  /* [SEL][Folders] Selector registry */
  const SEL = {
    projectsLabelH2: 'h2.__menu-label',
    projectsSectionA: 'div.group\\/sidebar-expando-section',
    projectsSectionB: 'div[class*="sidebar-expando-section"]',
    nav: 'nav',
    aside: 'aside',
    sidebarItemAnchor: 'a.__menu-item[href]',
    sidebarItemDiv: 'div.__menu-item',
    sidebarTruncate: '.truncate,[class*="truncate"]',
    radixMenu: '[role="menu"]',
    radixMenuItem: '[role="menuitem"]',
    menuCaptureBtn:
      'button.__menu-item-trailing-btn,' +
      'button[data-testid*="history-item"][data-testid$="options"],' +
      'button[data-testid$="options"],' +
      'button[aria-label*="conversation options"],' +
      'button[aria-label*="Open conversation options"]',
    currentChatAnchor: 'a[aria-current="page"][href*="/c/"]',
  };

  function DOM_findProjectsH2() {
    const labels = [...D.querySelectorAll(SEL.projectsLabelH2)];
    return labels.find((el) => CFG_PROJECTS_RE.test(UTIL_normText(el.textContent || ''))) || null;
  }

  // IMPORTANT: do NOT require inner rows; section may be collapsed
  function DOM_findProjectsSection(h2) {
    if (!h2) return null;
    const btn = h2.closest('button');
    if (!btn) return null;
    return (
      btn.closest(SEL.projectsSectionA) ||
      btn.closest(SEL.projectsSectionB) ||
      null
    );
  }

  function DOM_pickSidebarRoot(fromEl) {
    return fromEl?.closest?.(SEL.nav) || fromEl?.closest?.(SEL.aside) || fromEl?.parentElement || D.body;
  }

  function DOM_getProjectsSeeMoreRow() {
    const t = [...D.querySelectorAll(`nav ${SEL.sidebarItemDiv} ${SEL.sidebarTruncate}`)]
      .find((n) => UTIL_normText(n.textContent || '') === 'See more');
    return t?.closest?.('.__menu-item') || null;
  }

  function DOM_findMenuItemByText(menuEl, re) {
    const items = [...menuEl.querySelectorAll(SEL.radixMenuItem)];
    return items.find((it) => re.test(UTIL_normText(it.textContent || ''))) || null;
  }

  function DOM_setMenuItemLabel(menuItemEl, newText) {
    const tw = D.createTreeWalker(menuItemEl, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) {
      const t = UTIL_normText(n.nodeValue || '');
      if (!t) continue;
      if (/move to project/i.test(t) || /add to folder/i.test(t)) {
        n.nodeValue = newText;
        return;
      }
    }
    const el = menuItemEl.querySelector(SEL.sidebarTruncate);
    if (el) el.textContent = newText;
  }

  function DOM_getChatTitleFromSidebar(href) {
    try {
      const a = D.querySelector(`a[href="${CSS.escape(href)}"]`);
      return UTIL_normText(a?.innerText || href).slice(0, 80);
    } catch {
      return UTIL_normText(href).slice(0, 80);
    }
  }

  const DOM_parseChatIdFromHref = (href) => {
    const m = String(href || '').match(/\/c\/([a-z0-9-]+)/i);
    return m ? m[1] : null;
  };

  function DOM_findChatTitleInSidebarByHref(fullHref) {
    const anchors = D.querySelectorAll(SEL.sidebarItemAnchor);
    for (const a of anchors) {
      if ((a.getAttribute('href') || '') === fullHref) {
        const t = UTIL_normText(a.innerText);
        if (t) return t;
      }
    }
    const chatId = DOM_parseChatIdFromHref(fullHref);
    if (chatId) {
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        if (href.endsWith(`/c/${chatId}`)) {
          const t = UTIL_normText(a.innerText);
          if (t) return t;
        }
      }
    }
    return null;
  }

  /* ───────────────────────────── 🟪 UI BOUNDARY — CSS RULES 📄🔓💧 ───────────────────────────── */

  function CSS_FSECTION_TEXT() {
    const ROOT = UTIL_selScoped(UI_FSECTION_ROOT);
    const MENU = UTIL_selScoped(UI_FSECTION_MENU);
    const POP  = UTIL_selScoped(UI_FSECTION_POP);
    const MODAL = UTIL_selScoped(UI_FSECTION_MODAL);
    const VIEWER = UTIL_selScoped(UI_FSECTION_VIEWER);
    const SEP  = UTIL_selScoped(UI_FSECTION_SEP);
    const ICO_SLOT = UTIL_selScoped(UI_FSECTION_ICON_SLOT);
    const FROW = UTIL_selScoped(UI_FSECTION_FOLDER_ROW);
    const FMORE = UTIL_selScoped(UI_FSECTION_FOLDER_MORE);

    return `
/* ===========================
   ${MODICON} ${MODTAG} — cgxui (${SkID})
   =========================== */

${ROOT} svg{ width:16px; height:16px; opacity:.9; flex:0 0 auto; }
${ICO_SLOT}{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:20px; height:20px;
  margin-right:8px;
  opacity:1 !important;
  visibility:visible !important;
  flex:0 0 auto;
}

${SEP}{
  height: 1px;
  margin: 6px 8px;
  background: var(--border-default, rgba(255,255,255,.12));
}

/* A) Main folders dropdown menu (Assign Menu) */
${MENU}{
  position:fixed;
  z-index:999999;
  min-width:200px;
  background:rgba(30,30,30,.96);
  border:1px solid rgba(255,255,255,.10);
  border-radius:10px;
  box-shadow:0 12px 30px rgba(0,0,0,.45);
  overflow:hidden;
  backdrop-filter: blur(8px);
}
${MENU} button{
  all:unset;
  display:flex;
  width:100%;
  padding:10px 12px;
  cursor:pointer;
  color:rgba(255,255,255,.92);
  font-size:13px;
}
${MENU} button:hover{ background:rgba(255,255,255,.08); }
${MENU} [${ATTR_CGXUI_STATE}="muted"]{ opacity:.7; padding:10px 12px; font-size:12px; }
${MENU} ${SEP}{ margin:0; }

/* B) Folder row “⋯” button */
${FROW}{ position:relative; }
${FMORE}{
  all:unset;
  position:absolute;
  right:10px; top:50%;
  transform:translateY(-50%);
  width:28px; height:28px;
  display:flex;
  align-items:center;
  justify-content:center;
  border-radius:8px;
  cursor:pointer;
  color:rgba(255,255,255,.85);
  opacity:0;
}
${FROW}:hover ${FMORE},
${FROW}:focus-within ${FMORE}{ opacity:1; }
${FMORE}:hover{ background:rgba(255,255,255,.08); }
${FMORE}:active{ background:rgba(255,255,255,.10); }

/* C) Popover (Rename / Delete) */
${POP}{
  position:fixed;
  z-index:999999;
  padding:6px;
  min-width:210px;
  background: var(--bg-elevated-secondary, #181818);
  border: 1px solid var(--border-default, #ffffff26);
  border-radius:12px;
  box-shadow: var(--shadow-lg, 0 10px 15px -3px #0000001a, 0 4px 6px -4px #0000001a);
  backdrop-filter: blur(var(--blur-sm, 8px));
  overflow:hidden;
}
${POP} button{
  all:unset;
  display:flex;
  align-items:center;
  gap:10px;
  width:100%;
  padding:10px 12px;
  border-radius:10px;
  cursor:pointer;
  color: var(--text-primary, #fff);
  font-size: var(--text-sm, .875rem);
  line-height: 1;
}
${POP} button:hover{ background: var(--interactive-bg-secondary-hover, #ffffff1a); }
${POP} button:active{ background: var(--interactive-bg-secondary-press, #ffffff0d); }
${POP} button[${ATTR_CGXUI_STATE}="danger"]{ color: var(--text-error, #f93a37); }

${POP} [${ATTR_CGXUI_STATE}="ico"]{
  width:20px; height:20px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  color: currentColor;
}
${POP} [${ATTR_CGXUI_STATE}="ico"] svg{ width:20px; height:20px; fill: currentColor; }

/* D) Modal (Create / Rename) */
${MODAL}{
  position:fixed; inset:0;
  z-index:999999;
  background:rgba(0,0,0,.55);
  display:flex;
  align-items:flex-start;
  justify-content:center;
  padding-top:90px;
}
${MODAL} [${ATTR_CGXUI_STATE}="box"]{
  width:min(560px, calc(100vw - 32px));
  background:rgba(32,32,32,.98);
  border:1px solid rgba(255,255,255,.12);
  border-radius:16px;
  box-shadow:0 18px 60px rgba(0,0,0,.6);
  overflow:hidden;
}
${MODAL} [${ATTR_CGXUI_STATE}="hd"]{
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:14px 16px;
}
${MODAL} [${ATTR_CGXUI_STATE}="title"]{ font-size:14px; font-weight:600; opacity:.95; }
${MODAL} button[${ATTR_CGXUI_STATE}="x"]{
  all:unset;
  width:30px; height:30px;
  display:flex;
  align-items:center;
  justify-content:center;
  border-radius:10px;
  cursor:pointer;
  opacity:.9;
}
${MODAL} button[${ATTR_CGXUI_STATE}="x"]:hover{ background:rgba(255,255,255,.08); }
${MODAL} [${ATTR_CGXUI_STATE}="bd"]{ padding:0 16px 16px; }
${MODAL} input{
  width:100%;
  margin-top:6px;
  padding:12px 12px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.12);
  background:rgba(18,18,18,.8);
  color:rgba(255,255,255,.92);
  outline:none;
}
${MODAL} [${ATTR_CGXUI_STATE}="ft"]{
  display:flex;
  justify-content:flex-end;
  gap:10px;
  padding:12px 16px 16px;
}
${MODAL} button[${ATTR_CGXUI_STATE}="btn"]{
  all:unset;
  padding:10px 14px;
  border-radius:12px;
  cursor:pointer;
  font-size:13px;
  border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.06);
  color:rgba(255,255,255,.92);
}
${MODAL} button[${ATTR_CGXUI_STATE}="btn"]:hover{ background:rgba(255,255,255,.10); }
${MODAL} button[${ATTR_CGXUI_STATE}="primary"]{ background:rgba(255,255,255,.12); }
${MODAL} button[disabled]{ opacity:.4; cursor:not-allowed; }

/* Minimal viewer */
${VIEWER}{
  position: fixed; right: 18px; top: 90px; z-index: 999999;
  width: 360px; max-height: 60vh; overflow: hidden;
  background: rgba(20,20,20,.92); color: #fff;
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 14px; backdrop-filter: blur(10px);
  box-shadow: 0 18px 60px rgba(0,0,0,.45);
  font: 13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial;
}
${VIEWER} [${ATTR_CGXUI_STATE}="head"]{ display:flex; align-items:center; justify-content:space-between; padding: 10px 12px; }
${VIEWER} button{ border:0; background: transparent; color:#fff; cursor:pointer; font-size: 14px; opacity:.8; }
${VIEWER} button:hover{ opacity:1; }
${VIEWER} [${ATTR_CGXUI_STATE}="list"]{ padding: 6px 8px 10px; max-height: calc(60vh - 48px); overflow:auto; }
${VIEWER} a{ display:block; padding: 8px 10px; border-radius: 10px; color: inherit; text-decoration:none; }
${VIEWER} a:hover{ background: rgba(255,255,255,.08); }
`;
  }

  /* ───────────────────────────── 🟪 UI BOUNDARY — CSS INJECTOR 📝🔓💥 ───────────────────────────── */

  function UI_ensureStyle() {
    const existing = D.getElementById(CSS_FSECTION_STYLE_ID);
    if (existing) {
      const next = CSS_FSECTION_TEXT();
      if (existing.textContent !== next) existing.textContent = next;
      return;
    }
    const st = D.createElement('style');
    st.id = CSS_FSECTION_STYLE_ID;
    st.setAttribute(ATTR_CGXUI_OWNER, SkID);
    st.textContent = CSS_FSECTION_TEXT();
    D.documentElement.appendChild(st);
    CLEAN.nodes.add(st);
  }

  /* ───────────────────────────── 🟥 ENGINE — DOMAIN LOGIC 📝🔓💥 ───────────────────────────── */

  function STORE_readData() {
    // canonical first
    let data = UTIL_storage.getJSON(KEY_FSECTION_STATE_DATA_V1, null);
    if (!data || typeof data !== 'object') {
      // legacy bridge
      data = UTIL_storage.getJSON(KEY_LEG_DATA, null);
    }
    if (!data || typeof data !== 'object') data = { folders: [], items: {} };
    if (!Array.isArray(data.folders)) data.folders = [];
    if (!data.items || typeof data.items !== 'object') data.items = {};
    return data;
  }

  function STORE_readUI() {
    let ui = UTIL_storage.getJSON(KEY_FSECTION_STATE_UI_V1, null);
    if (!ui || typeof ui !== 'object') ui = UTIL_storage.getJSON(KEY_LEG_UI, null);
    if (!ui || typeof ui !== 'object') ui = { openFolders: {}, foldersExpanded: true };
    if (!ui.openFolders || typeof ui.openFolders !== 'object') ui.openFolders = {};
    if (typeof ui.foldersExpanded !== 'boolean') ui.foldersExpanded = true;
    return ui;
  }

  function STORE_writeData(data) {
    UTIL_storage.setJSON(KEY_FSECTION_STATE_DATA_V1, data);
    // keep legacy in sync so older parts never break
    UTIL_storage.setJSON(KEY_LEG_DATA, data);
  }

  function STORE_writeUI(ui) {
    UTIL_storage.setJSON(KEY_FSECTION_STATE_UI_V1, ui);
    UTIL_storage.setJSON(KEY_LEG_UI, ui);
  }

  function STORE_seedIfEmpty() {
    const d = STORE_readData();
    if (d.folders.length) return;

    const folders = CFG_SEED_FOLDERS.map((x) => ({ id: UTIL_uid(), name: x.name, createdAt: Date.now() }));
    const items = {};
    folders.forEach((f) => (items[f.id] = []));
    STORE_writeData({ folders, items });

    const ui = STORE_readUI();
    folders.forEach((f) => { ui.openFolders[f.id] = true; });
    STORE_writeUI(ui);
  }

  function ENGINE_rerenderAllSections() {
    const nodes = D.querySelectorAll(UTIL_selScoped(UI_FSECTION_ROOT));
    nodes.forEach((sec) => {
      const fn = sec?._cgxuiRender;
      if (typeof fn === 'function') SAFE_try('rerender', fn);
    });
  }

  /* Popover (folder row actions) */
  function UI_closeFolderPop() {
    if (STATE.popEl) SAFE_remove(STATE.popEl);
    STATE.popEl = null;
  }

  function UI_openFolderPop(anchorEl, items) {
    UI_ensureStyle();
    UI_closeFolderPop();

    const pop = D.createElement('div');
    pop.setAttribute(ATTR_CGXUI, UI_FSECTION_POP);
    pop.setAttribute(ATTR_CGXUI_OWNER, SkID);

    items.forEach((it) => {
      if (it === 'sep') {
        const sep = D.createElement('div');
        sep.setAttribute(ATTR_CGXUI, UI_FSECTION_SEP);
        sep.setAttribute(ATTR_CGXUI_OWNER, SkID);
        pop.appendChild(sep);
        return;
      }

      const b = D.createElement('button');
      b.type = 'button';
      if (it.danger) b.setAttribute(ATTR_CGXUI_STATE, 'danger');

      if (it.iconEl) {
        const ico = D.createElement('span');
        ico.setAttribute(ATTR_CGXUI_STATE, 'ico');
        ico.appendChild(it.iconEl.cloneNode(true));
        b.appendChild(ico);
      } else if (it.iconSvg) {
        const ico = D.createElement('span');
        ico.setAttribute(ATTR_CGXUI_STATE, 'ico');
        ico.innerHTML = it.iconSvg;
        b.appendChild(ico);
      }

      const label = D.createElement('span');
      label.textContent = it.label || '';
      b.appendChild(label);

      b.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        UI_closeFolderPop();
        SAFE_try('popItem', () => it.onClick?.());
      };

      pop.appendChild(b);
    });

    D.body.appendChild(pop);
    CLEAN.nodes.add(pop);
    STATE.popEl = pop;

    const pad = 8;
    const rA = anchorEl.getBoundingClientRect();
    const rP = pop.getBoundingClientRect();

    let left = Math.min(rA.right - rP.width, innerWidth - rP.width - pad);
    let top = Math.min(rA.bottom + 6, innerHeight - rP.height - pad);
    left = Math.max(pad, left);
    top = Math.max(pad, top);

    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;

    // close on outside click
    setTimeout(() => {
      const onDoc = (e) => {
        if (!STATE.popEl) return;
        if (!STATE.popEl.contains(e.target)) UI_closeFolderPop();
      };
      D.addEventListener('mousedown', onDoc, true);
      CLEAN.listeners.add(() => D.removeEventListener('mousedown', onDoc, true));
    }, 0);
  }

  /* Modal (create/rename) */
  function UI_openNameModal({ title, placeholder, initialValue, confirmText }) {
    UI_ensureStyle();

    return new Promise((resolve) => {
      const ov = D.createElement('div');
      ov.setAttribute(ATTR_CGXUI, UI_FSECTION_MODAL);
      ov.setAttribute(ATTR_CGXUI_OWNER, SkID);

      const box = D.createElement('div');
      box.setAttribute(ATTR_CGXUI_STATE, 'box');

      const hd = D.createElement('div');
      hd.setAttribute(ATTR_CGXUI_STATE, 'hd');

      const t = D.createElement('div');
      t.setAttribute(ATTR_CGXUI_STATE, 'title');
      t.textContent = title;

      const x = D.createElement('button');
      x.type = 'button';
      x.setAttribute(ATTR_CGXUI_STATE, 'x');
      x.textContent = '×';

      hd.appendChild(t);
      hd.appendChild(x);

      const bd = D.createElement('div');
      bd.setAttribute(ATTR_CGXUI_STATE, 'bd');

      const input = D.createElement('input');
      input.placeholder = placeholder || '';
      input.value = initialValue || '';
      bd.appendChild(input);

      const ft = D.createElement('div');
      ft.setAttribute(ATTR_CGXUI_STATE, 'ft');

      const cancel = D.createElement('button');
      cancel.type = 'button';
      cancel.setAttribute(ATTR_CGXUI_STATE, 'btn');
      cancel.textContent = 'Cancel';

      const ok = D.createElement('button');
      ok.type = 'button';
      ok.setAttribute(ATTR_CGXUI_STATE, 'btn');
      ok.setAttribute(ATTR_CGXUI_STATE, 'primary'); // visual
      ok.textContent = confirmText || 'OK';

      const sync = () => { ok.disabled = !input.value.trim(); };
      sync();

      ft.appendChild(cancel);
      ft.appendChild(ok);

      box.appendChild(hd);
      box.appendChild(bd);
      box.appendChild(ft);

      ov.appendChild(box);
      D.body.appendChild(ov);
      CLEAN.nodes.add(ov);

      const done = (v) => { SAFE_remove(ov); resolve(v); };

      x.onclick = () => done(null);
      cancel.onclick = () => done(null);
      ok.onclick = () => done(input.value.trim() || null);

      ov.addEventListener('mousedown', (e) => { if (e.target === ov) done(null); });
      input.addEventListener('input', sync);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') done(null);
        if (e.key === 'Enter') { e.preventDefault(); if (!ok.disabled) ok.click(); }
      });

      setTimeout(() => input.focus(), 0);
    });
  }

  /* Sidebar row builders (clone templates if available) */
  function UI_makeRowShell(tplDiv, tplA, fallbackClass, tagName = 'div') {
    const tag = (tagName || 'div').toLowerCase();
    const tpl = (tag === 'a' ? tplA : tplDiv) || tplA || tplDiv;

    if (tpl) {
      const row = tpl.cloneNode(true);
      row.querySelectorAll?.('[id]')?.forEach((el) => el.removeAttribute('id'));
      row.removeAttribute?.('draggable');
      row.removeAttribute?.('data-discover');
      row.removeAttribute?.('data-testid');

      row.querySelectorAll?.('.trailing-pair')?.forEach((n) => n.remove());
      row.querySelectorAll?.('button[data-testid], button[aria-label], button[data-trailing-button]')?.forEach((n) => n.remove());

      if (row.tagName === 'A') row.setAttribute('href', '#');
      row.tabIndex = 0;
      return row;
    }

    const row = D.createElement(tag);
    row.className = fallbackClass;
    if (tag === 'a') row.setAttribute('href', '#');
    row.tabIndex = 0;
    row.innerHTML = `
      <div class="flex min-w-0 grow items-center gap-2.5">
        <div class="truncate"></div>
      </div>
    `;
    return row;
  }

  function UI_setRowText(rowEl, text) {
    const trunc = rowEl.querySelector?.(SEL.sidebarTruncate);
    if (trunc) trunc.textContent = text;
    else rowEl.textContent = text;
  }

  function UI_injectIcon(rowEl, svg) {
    if (!svg) return;
    if (rowEl.querySelector(`[${ATTR_CGXUI}="${UI_FSECTION_ICON_SLOT}"][${ATTR_CGXUI_OWNER}="${SkID}"]`)) return;

    const slot = D.createElement('span');
    slot.setAttribute(ATTR_CGXUI, UI_FSECTION_ICON_SLOT);
    slot.setAttribute(ATTR_CGXUI_OWNER, SkID);
    slot.innerHTML = svg;

    const trunc = rowEl.querySelector?.(SEL.sidebarTruncate);
    if (trunc && trunc.parentElement) trunc.parentElement.insertBefore(slot, trunc);
    else rowEl.insertBefore(slot, rowEl.firstChild);
  }

  function UI_wireAsButton(rowEl, onClick) {
    rowEl.setAttribute('role', 'button');
    rowEl.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onClick?.(); };
    rowEl.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); }
    };
    return rowEl;
  }

  /* Build the Folders section */
  function UI_buildFoldersSection(projectsSection) {
    const projectsHeaderBtn =
      projectsSection.querySelector(':scope > button') ||
      projectsSection.querySelector('button');

    if (!projectsHeaderBtn) return null;

    const section = D.createElement('div');
    section.className = projectsSection.className;

    section.setAttribute(ATTR_CGXUI, UI_FSECTION_ROOT);
    section.setAttribute(ATTR_CGXUI_OWNER, SkID);

    // header clone
    const headerBtn = projectsHeaderBtn.cloneNode(true);
    headerBtn.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    headerBtn.removeAttribute('aria-controls');

    const label = headerBtn.querySelector('h2.__menu-label');
    if (label) label.textContent = CFG_FSECTION_LABEL;

    const listWrap = D.createElement('div');

    // row templates
    const tplDiv = D.querySelector(`nav ${SEL.sidebarItemDiv}`) || D.querySelector(SEL.sidebarItemDiv) || null;
    const tplA   = D.querySelector(`nav ${SEL.sidebarItemAnchor}`) || D.querySelector(SEL.sidebarItemAnchor) || null;
    const FALLBACK_ROW_CLASS = (tplDiv?.className || tplA?.className || 'group __menu-item hoverable');

    const makeActionRow = (text, iconSvg, onClick) => {
      const row = UI_makeRowShell(tplDiv, tplA, FALLBACK_ROW_CLASS, 'div');
      UI_setRowText(row, text);
      UI_injectIcon(row, `<svg class="h2o-folder-ico" viewBox="0 0 24 24" aria-hidden="true">${iconSvg.replace(/<svg[^>]*>|<\/svg>/g,'')}</svg>`);
      return UI_wireAsButton(row, onClick);
    };

    const makeFolderRow = (text, iconSvg, onClick) => {
      const row = UI_makeRowShell(tplDiv, tplA, FALLBACK_ROW_CLASS, 'a');
      UI_setRowText(row, text);
      UI_injectIcon(row, `<svg class="h2o-folder-ico" viewBox="0 0 24 24" aria-hidden="true">${iconSvg.replace(/<svg[^>]*>|<\/svg>/g,'')}</svg>`);
      return UI_wireAsButton(row, onClick);
    };

    const makeSubChatRow = (href, text) => {
      const a = UI_makeRowShell(tplDiv, tplA, FALLBACK_ROW_CLASS, 'a');
      a.setAttribute('href', href);
      a.setAttribute('role', 'link');
      a.classList.add('ps-9');
      UI_setRowText(a, text);
      return a;
    };

    // independent expand/collapse state
    let expanded = STORE_readUI().foldersExpanded;

    const applyExpandedToDOM = () => {
      headerBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      listWrap.style.display = expanded ? '' : 'none';
    };

    const setExpanded = (v) => {
      expanded = !!v;
      const ui = STORE_readUI();
      ui.foldersExpanded = expanded;
      STORE_writeUI(ui);
      // also keep legacy "h2o:folders:expanded" string key in sync
      UTIL_storage.setStr(KEY_LEG_EXP, expanded ? '1' : '0');
      UTIL_storage.setJSON(KEY_FSECTION_STATE_EXP_V1, { expanded });
      applyExpandedToDOM();
    };

    headerBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setExpanded(!expanded); };

    const applySeeMoreControl = () => {
      listWrap.querySelectorAll(':scope > [data-cgxui-state="see-more"]').forEach((n) => n.remove());

      const groups = [...listWrap.querySelectorAll(':scope > [data-cgxui-state="folder-group"]')];
      if (groups.length <= CFG_SEE_MORE_LIMIT) {
        groups.forEach((g) => (g.style.display = 'contents'));
        return;
      }

      // canonical state
      let expandedList = UTIL_storage.getJSON(KEY_FSECTION_STATE_SEE_V1, null)?.expandedList;
      if (typeof expandedList !== 'boolean') expandedList = (UTIL_storage.getStr(KEY_LEG_SEE, '0') === '1');

      groups.forEach((g, i) => {
        g.style.display = (expandedList || i < CFG_SEE_MORE_LIMIT) ? 'contents' : 'none';
      });

      const row = makeActionRow(expandedList ? 'See less' : 'See more', FRAG_SVG_MORE, () => {
        const next = !expandedList;
        UTIL_storage.setJSON(KEY_FSECTION_STATE_SEE_V1, { expandedList: next });
        UTIL_storage.setStr(KEY_LEG_SEE, next ? '1' : '0');
        applySeeMoreControl();
      });

      row.setAttribute('data-cgxui-state', 'see-more');
      listWrap.appendChild(row);
    };

    const render = () => {
      const data = STORE_readData();
      const ui = STORE_readUI();

      listWrap.innerHTML = '';

      // New folder
      listWrap.appendChild(makeActionRow('New folder', FRAG_SVG_ADD, async () => {
        const name = await UI_openNameModal({
          title: 'Create folder',
          placeholder: 'Folder name',
          initialValue: '',
          confirmText: 'Create folder'
        });
        if (!name) return;

        const d = STORE_readData();
        const exists = d.folders.some((f) => (f.name || '').trim().toLowerCase() === name.toLowerCase());
        if (exists) return alert('Folder already exists.');

        const id = UTIL_uid();
        d.folders.push({ id, name, createdAt: Date.now() });
        d.items[id] = d.items[id] || [];
        STORE_writeData(d);

        const u = STORE_readUI();
        u.openFolders[id] = true;
        STORE_writeUI(u);

        render();
      }));

      // Folder groups
      data.folders.forEach((folder) => {
        const isOpen = !!ui.openFolders[folder.id];
        const hrefs = Array.isArray(data.items[folder.id]) ? data.items[folder.id] : [];

        const grp = D.createElement('div');
        grp.setAttribute('data-cgxui-state', 'folder-group');
        grp.style.display = 'contents';

        const row = makeFolderRow(folder.name, FRAG_SVG_FOLDER, () => {
          const u = STORE_readUI();
          u.openFolders[folder.id] = !u.openFolders[folder.id];
          STORE_writeUI(u);
          render();
        });

        // mark row as owned for CSS hover more button
        row.setAttribute(ATTR_CGXUI, UI_FSECTION_FOLDER_ROW);
        row.setAttribute(ATTR_CGXUI_OWNER, SkID);

        const more = D.createElement('button');
        more.type = 'button';
        more.textContent = '⋯';
        more.title = 'Folder actions';
        more.setAttribute(ATTR_CGXUI, UI_FSECTION_FOLDER_MORE);
        more.setAttribute(ATTR_CGXUI_OWNER, SkID);

        more.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();

          UI_openFolderPop(more, [
            {
              label: 'Rename folder',
              onClick: async () => {
                const next = await UI_openNameModal({
                  title: 'Rename folder',
                  placeholder: 'Folder name',
                  initialValue: folder.name || '',
                  confirmText: 'Rename'
                });
                if (!next) return;

                const d = STORE_readData();
                const exists = d.folders.some((f) =>
                  f.id !== folder.id && (f.name || '').trim().toLowerCase() === next.toLowerCase()
                );
                if (exists) return alert('Folder already exists.');

                const target = d.folders.find((f) => f.id === folder.id);
                if (target) target.name = next;
                STORE_writeData(d);
                render();
              }
            },
            'sep',
            {
              label: 'Delete folder',
              danger: true,
              onClick: () => {
                const ok = confirm(`Delete folder "${folder.name}"?`);
                if (!ok) return;

                const d = STORE_readData();
                d.folders = d.folders.filter((f) => f.id !== folder.id);
                delete d.items[folder.id];
                STORE_writeData(d);

                const u = STORE_readUI();
                delete u.openFolders[folder.id];
                STORE_writeUI(u);

                render();
              }
            }
          ]);
        };

        row.appendChild(more);

        // count badge (kept)
        const trunc = row.querySelector?.(SEL.sidebarTruncate);
        if (trunc) {
          const span = D.createElement('span');
          span.style.opacity = '.6';
          span.style.marginLeft = '8px';
          span.style.fontSize = '12px';
          span.textContent = `(${hrefs.length})`;
          trunc.parentElement?.appendChild(span);
        }

        grp.appendChild(row);

        if (isOpen) {
          hrefs.forEach((fullHref) => {
            const title = DOM_findChatTitleInSidebarByHref(fullHref);
            const fallbackId = DOM_parseChatIdFromHref(fullHref);
            const label = title ? title : (fallbackId || fullHref);
            grp.appendChild(makeSubChatRow(fullHref, label));
          });
        }

        listWrap.appendChild(grp);
      });

      applySeeMoreControl();
      applyExpandedToDOM();
    };

    section.appendChild(headerBtn);
    section.appendChild(listWrap);

    // store render function on owned root (no raw "h2o" fields)
    section._cgxuiRender = render;

    render();
    applyExpandedToDOM();

    return section;
  }

  /* Assign menu (Shift+Right-click) */
  function UI_closeAssignMenu() {
    if (STATE.menuEl) SAFE_remove(STATE.menuEl);
    STATE.menuEl = null;
  }

  function UI_openAssignMenu(x, y, fullHref) {
    UI_ensureStyle();
    UI_closeAssignMenu();

    STORE_seedIfEmpty();
    const d = STORE_readData();

    const m = D.createElement('div');
    m.setAttribute(ATTR_CGXUI, UI_FSECTION_MENU);
    m.setAttribute(ATTR_CGXUI_OWNER, SkID);

    const head = D.createElement('div');
    head.setAttribute(ATTR_CGXUI_STATE, 'muted');
    head.textContent = 'Add/Remove chat in folders';
    m.appendChild(head);

    const sep = D.createElement('div');
    sep.setAttribute(ATTR_CGXUI, UI_FSECTION_SEP);
    sep.setAttribute(ATTR_CGXUI_OWNER, SkID);
    m.appendChild(sep);

    d.folders.forEach((f) => {
      const arr = Array.isArray(d.items[f.id]) ? d.items[f.id] : [];
      const inFolder = arr.includes(fullHref);

      const btn = D.createElement('button');
      btn.type = 'button';
      btn.innerHTML = `${UTIL_escHtml(f.name)} <span style="margin-left:auto;opacity:.7;">${inFolder ? '✓' : ''}</span>`;

      btn.onclick = () => {
        const dd = STORE_readData();
        dd.items = dd.items && typeof dd.items === 'object' ? dd.items : {};

        // ✅ one-folder max behavior (fixes the duplicated/overwritten onclick bug in your pasted script)
        if (CFG_ASSIGN_ONE_FOLDER_MAX) {
          for (const fid of Object.keys(dd.items)) {
            dd.items[fid] = (dd.items[fid] || []).filter((h) => h !== fullHref);
          }
          if (!inFolder) {
            dd.items[f.id] = Array.isArray(dd.items[f.id]) ? dd.items[f.id] : [];
            dd.items[f.id].push(fullHref);
            dd.items[f.id] = [...new Set(dd.items[f.id])];
          }
        } else {
          dd.items[f.id] = Array.isArray(dd.items[f.id]) ? dd.items[f.id] : [];
          const list = dd.items[f.id];
          if (inFolder) dd.items[f.id] = list.filter((h) => h !== fullHref);
          else dd.items[f.id] = [...new Set([...list, fullHref])];
        }

        STORE_writeData(dd);
        UI_closeAssignMenu();
        ENGINE_rerenderAllSections();
      };

      m.appendChild(btn);
    });

    D.body.appendChild(m);
    CLEAN.nodes.add(m);
    STATE.menuEl = m;

    // position
    const pad = 8;
    const r = m.getBoundingClientRect();
    let left = x, top = y;
    if (left + r.width > innerWidth - pad) left = innerWidth - r.width - pad;
    if (top + r.height > innerHeight - pad) top = innerHeight - r.height - pad;
    m.style.left = `${left}px`;
    m.style.top = `${top}px`;

    // outside click close
    setTimeout(() => {
      const onDoc = (e) => {
        if (!STATE.menuEl) return;
        if (!STATE.menuEl.contains(e.target)) UI_closeAssignMenu();
      };
      D.addEventListener('mousedown', onDoc, true);
      CLEAN.listeners.add(() => D.removeEventListener('mousedown', onDoc, true));
    }, 0);
  }

  /* Radix "..." menu injection: Add "Add to Folder" item */
  function ENGINE_injectAddToFolder(menuEl) {
    if (!menuEl) return;

    // fallback capture: current chat
    if (!STATE.lastChatHrefForMenu) {
      const a = D.querySelector(SEL.currentChatAnchor);
      if (a) STATE.lastChatHrefForMenu = a.getAttribute('href') || '';
    }

    if (menuEl.querySelector(`[${ATTR_CGXUI}="${SkID}-add-to-folder"]`)) return;

    const moveItem = DOM_findMenuItemByText(menuEl, /move to project/i);
    if (!moveItem) return;

    const href = STATE.lastChatHrefForMenu;
    if (!href) return;

    const addItem = moveItem.cloneNode(true);
    addItem.setAttribute(ATTR_CGXUI, `${SkID}-add-to-folder`);
    DOM_setMenuItemLabel(addItem, 'Add to Folder');

    addItem.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r = addItem.getBoundingClientRect();
      UI_openAssignMenu(r.right + 6, Math.max(8, r.top - 8), href);
    }, true);

    moveItem.parentNode.insertBefore(addItem, moveItem.nextSibling);
  }

  /* Minimal viewer (kept feature; storage key preserved as-is) */
  const KEY_LEG_VIEWER_STORE = 'h2o:folders:v1';

  function UI_closeViewer() {
    if (STATE.viewerEl) SAFE_remove(STATE.viewerEl);
    STATE.viewerEl = null;
  }

  function UI_openFolderViewer(folderId) {
    UI_ensureStyle();

    let store = UTIL_storage.getJSON(KEY_LEG_VIEWER_STORE, {});
    if (!store || typeof store !== 'object') store = {};
    const folders = store.folders || [];
    const chatToFolders = store.chatToFolders || {};

    const folder = folders.find((f) => f.id === folderId);
    const title = folder ? folder.name : folderId;

    const chats = Object.entries(chatToFolders)
      .filter(([href, ids]) => Array.isArray(ids) && ids.includes(folderId))
      .map(([href]) => ({ href, title: DOM_getChatTitleFromSidebar(href) }));

    UI_closeViewer();

    const box = D.createElement('div');
    box.setAttribute(ATTR_CGXUI, UI_FSECTION_VIEWER);
    box.setAttribute(ATTR_CGXUI_OWNER, SkID);

    const head = D.createElement('div');
    head.setAttribute(ATTR_CGXUI_STATE, 'head');

    const ttl = D.createElement('div');
    ttl.innerHTML = `Folder: <b>${UTIL_escHtml(title)}</b> (${chats.length})`;

    const x = D.createElement('button');
    x.type = 'button';
    x.textContent = '✕';
    x.onclick = UI_closeViewer;

    head.appendChild(ttl);
    head.appendChild(x);

    const list = D.createElement('div');
    list.setAttribute(ATTR_CGXUI_STATE, 'list');

    chats.forEach((c) => {
      const row = D.createElement('a');
      row.href = c.href;
      row.textContent = c.title;
      list.appendChild(row);
    });

    box.appendChild(head);
    box.appendChild(list);

    D.body.appendChild(box);
    CLEAN.nodes.add(box);
    STATE.viewerEl = box;
  }

  /* ───────────────────────────── 🟨 TIME — SCHEDULING / REACTIVITY 📝🔓💥 ───────────────────────────── */

  function TIME_clearTimers() {
    for (const t of CLEAN.timers) { try { clearTimeout(t); clearInterval(t); } catch {} }
    CLEAN.timers.clear();
  }

  function TIME_addListener(addFn, removeFn) {
    SAFE_try('addListener', addFn);
    CLEAN.listeners.add(removeFn);
  }

  function OBS_ensureSidebarObserver(root) {
    if (STATE.observedRoot === root) return;
    if (STATE.sidebarMO) { try { STATE.sidebarMO.disconnect(); } catch {} }

    STATE.observedRoot = root;
    const mo = new MutationObserver((muts) => {
      if (STATE.suppressMO) return;

      // Ignore our owned UI and our menus/popovers/modals/viewer
      const relevant = muts.some((mu) => {
        const t = mu.target;
        if (!(t instanceof HTMLElement)) return true;
        return !t.closest?.(UTIL_selScoped(UI_FSECTION_ROOT)) &&
               !t.closest?.(UTIL_selScoped(UI_FSECTION_MENU)) &&
               !t.closest?.(UTIL_selScoped(UI_FSECTION_POP)) &&
               !t.closest?.(UTIL_selScoped(UI_FSECTION_MODAL)) &&
               !t.closest?.(UTIL_selScoped(UI_FSECTION_VIEWER));
      });
      if (!relevant) return;

      TIME_scheduleEnsure('mutation');
    });

    mo.observe(root, { childList: true, subtree: true });
    STATE.sidebarMO = mo;
    CLEAN.observers.add(() => { try { mo.disconnect(); } catch {} });
  }

  function TIME_scheduleEnsure(reason) {
    if (STATE.ensureTimer) clearTimeout(STATE.ensureTimer);
    STATE.ensureTimer = setTimeout(() => CORE_FS_ensureInjected(reason), 150);
    CLEAN.timers.add(STATE.ensureTimer);
  }

  function OBS_hookShiftContextMenuOnce() {
    if (STATE.ctxHooked) return;
    STATE.ctxHooked = true;

    const onCtx = (e) => {
      if (!e.shiftKey) return;
      const a = e.target?.closest?.('a.__menu-item[href*="/c/"]');
      if (!a) return;

      const href = a.getAttribute('href') || '';
      if (href.endsWith('/project')) return;
      if (!/\/c\/[a-z0-9-]+/i.test(href)) return;

      e.preventDefault();
      e.stopPropagation();
      UI_openAssignMenu(e.clientX, e.clientY, href);
    };

    const onKey = (e) => { if (e.key === 'Escape') { UI_closeAssignMenu(); UI_closeFolderPop(); } };

    TIME_addListener(
      () => D.addEventListener('contextmenu', onCtx, true),
      () => D.removeEventListener('contextmenu', onCtx, true)
    );
    TIME_addListener(
      () => D.addEventListener('keydown', onKey, true),
      () => D.removeEventListener('keydown', onKey, true)
    );
  }

  function OBS_hookRadixMenuInjectionOnce() {
    if (STATE.menuHooked) return;
    STATE.menuHooked = true;

    // capture which chat the "..." menu belongs to
    const onPointerDown = (e) => {
      const btn = e.target?.closest?.(SEL.menuCaptureBtn);
      if (!btn) return;
      const a = btn.closest('a[href*="/c/"]');
      if (!a) return;
      STATE.lastChatHrefForMenu = a.getAttribute('href') || '';
    };

    TIME_addListener(
      () => D.addEventListener('pointerdown', onPointerDown, true),
      () => D.removeEventListener('pointerdown', onPointerDown, true)
    );

    const mo = new MutationObserver((muts) => {
      for (const mu of muts) {
        for (const node of mu.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          const menus = [];
          if (node.getAttribute?.('role') === 'menu') menus.push(node);
          else if (node.querySelectorAll) menus.push(...node.querySelectorAll(SEL.radixMenu));

          if (!menus.length) continue;

          for (const menu of menus) {
            requestAnimationFrame(() => {
              const txt = UTIL_normText(menu.innerText || '');
              // lightweight signature check (same as your original intention)
              if (/move to project/i.test(txt) || /pin chat/i.test(txt) || /archive/i.test(txt) || /delete/i.test(txt)) {
                ENGINE_injectAddToFolder(menu);
              }
            });
          }
        }
      }
    });

    mo.observe(D.body, { childList: true, subtree: true });
    STATE.menuMO = mo;
    CLEAN.observers.add(() => { try { mo.disconnect(); } catch {} });
  }

  /* ───────────────────────────── 🟦 SURFACE — EVENTS / API 📄🔒💧 ───────────────────────────── */
  // (No public EV_/PORT required for this module right now.)

  /* ───────────────────────────── ⚫️ LIFECYCLE — INIT / WIRING 📝🔓💥 ───────────────────────────── */

  function CORE_FS_ensureInjected(reason) {
    if (STATE.building) return;

    const h2 = DOM_findProjectsH2();
    if (!h2) return;

    const projectsSection = DOM_findProjectsSection(h2);
    if (!projectsSection || !projectsSection.parentElement) return;

    OBS_ensureSidebarObserver(DOM_pickSidebarRoot(projectsSection));

    const parent = projectsSection.parentElement;

    // already correct placement?
    const existing = parent.querySelector(`:scope > ${UTIL_selScoped(UI_FSECTION_ROOT)}`);
    if (existing && projectsSection.previousElementSibling === existing) {
      DIAG_step('already-ok', reason);
      return;
    }

    STATE.building = true;
    STATE.suppressMO = true;

    try {
      // remove stale (only in this parent)
      parent.querySelectorAll(`:scope > ${UTIL_selScoped(UI_FSECTION_ROOT)}`).forEach((n) => n.remove());

      STORE_seedIfEmpty();

      const folders = UI_buildFoldersSection(projectsSection);
      if (!folders) return;

      parent.insertBefore(folders, projectsSection);
      DIAG_step('injected', reason);
    } catch (e) {
      DIAG_err('ensureInjected', e);
    } finally {
      STATE.suppressMO = false;
      STATE.building = false;
    }
  }

  function CORE_FS_boot() {
    if (STATE.booted) return;
    STATE.booted = true;

    UI_ensureStyle();
    OBS_hookShiftContextMenuOnce();
    OBS_hookRadixMenuInjectionOnce();

    CORE_FS_ensureInjected('boot');

    // short retry window (React late-mount)
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      CORE_FS_ensureInjected('interval');
      if (tries >= 12) { try { clearInterval(iv); } catch {} }
    }, 800);

    CLEAN.timers.add(iv);
  }

  /* ───────────────────────────── ⚪️ LIFECYCLE — DISPOSE / CLEANUP 📝🔓💥 ───────────────────────────── */

  function CORE_FS_dispose() {
    // idempotent
    UI_closeAssignMenu();
    UI_closeFolderPop();
    UI_closeViewer();

    // remove injected sections
    try {
      D.querySelectorAll(UTIL_selScoped(UI_FSECTION_ROOT)).forEach((n) => n.remove());
    } catch {}

    // observers
    for (const off of CLEAN.observers) { try { off(); } catch {} }
    CLEAN.observers.clear();

    // listeners
    for (const off of CLEAN.listeners) { try { off(); } catch {} }
    CLEAN.listeners.clear();

    // timers
    TIME_clearTimers();
    STATE.ensureTimer = 0;

    // style + owned nodes
    for (const n of CLEAN.nodes) { try { n.remove(); } catch {} }
    CLEAN.nodes.clear();

    // reset booted
    STATE.booted = false;
  }

  // Expose lifecycle on vault (internal)
  MOD.core = MOD.core || {};
  MOD.core.boot = CORE_FS_boot;
  MOD.core.dispose = CORE_FS_dispose;

  /* ───────────────────────────── ✅ BOOT (lifecycle entrypoint) ───────────────────────────── */
  SAFE_try('boot', () => CORE_FS_boot());

})();
