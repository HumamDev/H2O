// ==UserScript==
// @h2o-id             3w2a.context.tab
// @name               3W2a.🟠🧠 Context Tab 🧠
// @namespace          H2O.Premium.CGX.context.tab
// @author             HumamDev
// @version            1.0.0
// @revision           002
// @build              260312-160500
// @description        Dock tab renderer for Context Stack. Registers as Dock tab "context", patches a persistent shell, and augments Dock launchers without changing Dock internals.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const D = W.document;

  const TOK = 'CT';
  const PID = 'ctxtab';
  const CID = 'contexttab';
  const SkID = 'cttb';
  const BrID = PID;

  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || {};

  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});
  VAULT.meta = VAULT.meta || { tok: TOK, pid: PID, cid: CID, skid: SkID };

  const STR = Object.freeze({
    tabId: 'context',
    tabTitle: 'Context',
    railSlotId: 'slot6',
    searchPh: 'Search context…',
    previewTitle: 'Active Stack Preview',
    emptyEngine: 'Context Engine not loaded. Enable <b>3W1a.🟧🧠 Context Engine 🧠</b>.',
    emptyActive: 'No active context yet. Add items from Library or promote from Notes/Highlights.',
    emptyLibrary: 'No context items saved for this chat yet.',
    emptyHistory: 'No context insert history yet.',
    emptyPreview: 'No active context selected for this profile.',
    promoteNotes: 'Promote Notes',
    promoteHighlights: 'Promote Highlights',
    promoteBookmarks: 'Promote Bookmarks',
    clearHistory: 'Clear History',
    exportJson: 'Export JSON',
    sortTitle: 'Library Sort',
  });

  const CLS = Object.freeze({
    styleId: `ctxui-${SkID}-style`,
    root: 'ctxTabRoot',
    toolbar: 'ctxToolbar',
    titlebar: 'ctxTitlebar',
    titleIcon: 'ctxTitleIcon',
    titleText: 'ctxTitleText',
    activeCount: 'ctxActiveCount',
    primaryActions: 'ctxPrimaryActions',
    searchWrap: 'ctxSearchWrap',
    searchInput: 'ctxSearchInput',
    modePills: 'ctxModePills',
    mode: 'ctxMode',
    profilePills: 'ctxProfilePills',
    profile: 'ctxProfile',
    listWrap: 'ctxListWrap',
    row: 'ctxRow',
    rowOrder: 'ctxRowOrder',
    rowBody: 'ctxRowBody',
    rowTitle: 'ctxRowTitle',
    rowPreview: 'ctxRowPreview',
    rowMeta: 'ctxRowMeta',
    rowActions: 'ctxRowActions',
    previewWrap: 'ctxPreviewWrap',
    previewTitle: 'ctxPreviewTitle',
    previewBox: 'ctxPreviewBox',
    previewActions: 'ctxPreviewActions',
    inlineEditor: 'ctxInlineEditor',
    emptyState: 'ctxEmptyState',
    btn: 'ctxBtn',
    btnPrimary: 'ctxBtnPrimary',
    btnGhost: 'ctxBtnGhost',
    btnDanger: 'ctxBtnDanger',
    btnNew: 'ctxBtnNew',
    btnInsert: 'ctxBtnInsert',
    btnCopy: 'ctxBtnCopy',
    btnMenu: 'ctxBtnMenu',
    menuWrap: 'ctxMenuWrap',
    menuPanel: 'ctxMenuPanel',
    menuGroup: 'ctxMenuGroup',
    menuTitle: 'ctxMenuTitle',
    menuItem: 'ctxMenuItem',
    menuRow: 'ctxMenuRow',
    editorGrid: 'ctxEditorGrid',
    field: 'ctxField',
    label: 'ctxLabel',
    input: 'ctxInput',
    textarea: 'ctxTextarea',
    select: 'ctxSelect',
    editorSource: 'ctxEditorSource',
    editorButtons: 'ctxEditorButtons',
    tag: 'ctxTag',
    sourceBadge: 'ctxSourceBadge',
    profileBadge: 'ctxProfileBadge',
    activeDot: 'ctxActiveDot',
    rowExpanded: 'ctxRowExpanded',
    rowMenuAnchor: 'ctxRowMenuAnchor',
    rowMenuToggle: 'ctxRowMenuToggle',
    sectionLabel: 'ctxSectionLabel',
    historyMeta: 'ctxHistoryMeta',
    subtle: 'ctxSubtle',
  });

  const ATTR = Object.freeze({
    mode: 'data-ctx-mode',
    sort: 'data-ctx-sort',
    act: 'data-ctx-act',
    id: 'data-ctx-id',
    menu: 'data-ctx-menu',
    search: 'data-ctx-search',
    profile: 'data-ctx-profile',
    draftField: 'data-ctx-draft-field',
    editField: 'data-ctx-edit-field',
  });

  const DOCK_ATTR = Object.freeze({
    viewMenu: 'data-h2o-view-menu',
    setView: 'data-h2o-set-view',
    railView: 'data-h2o-rail-view',
    railDummy: 'data-cgxui-rail-dummy',
  });

  const PROFILES = Object.freeze(['coding', 'legal', 'study']);
  const MODES = Object.freeze(['active', 'library', 'history']);
  const SORTS = Object.freeze(['manual', 'updated', 'created', 'title']);

  VAULT.diag = VAULT.diag || { ver: 'context-tab-v2', bootCount: 0, lastBootAt: 0, steps: [], lastError: null, stepsMax: 140 };
  function DIAG(name, extra) {
    try {
      const d = VAULT.diag;
      d.steps.push({ t: Date.now(), name, extra: extra ?? null });
      if (d.steps.length > d.stepsMax) d.steps.shift();
    } catch (_) {}
  }

  VAULT.state = VAULT.state || {};
  VAULT.state.boundLists = VAULT.state.boundLists instanceof WeakSet ? VAULT.state.boundLists : new WeakSet();
  VAULT.state.booted = !!VAULT.state.booted;
  VAULT.state.tries = Number(VAULT.state.tries || 0);
  VAULT.state.ready = !!VAULT.state.ready;
  VAULT.state.bootRaf = Number(VAULT.state.bootRaf || 0);
  VAULT.state.patchRaf = Number(VAULT.state.patchRaf || 0);
  VAULT.state.dockApi = VAULT.state.dockApi || null;
  VAULT.state.railMo = VAULT.state.railMo || null;
  VAULT.state.eventsBound = !!VAULT.state.eventsBound;
  VAULT.state.searchT = Number(VAULT.state.searchT || 0);
  VAULT.state.mount = VAULT.state.mount && typeof VAULT.state.mount === 'object'
    ? VAULT.state.mount
    : { panelEl: null, listEl: null, root: null, refs: null, bg: 'bar' };
  VAULT.state.ui = VAULT.state.ui && typeof VAULT.state.ui === 'object' ? VAULT.state.ui : {};
  VAULT.state.ui.menuOpen = !!VAULT.state.ui.menuOpen;
  VAULT.state.ui.rowMenuId = String(VAULT.state.ui.rowMenuId || '');
  VAULT.state.ui.newOpen = !!VAULT.state.ui.newOpen;
  VAULT.state.ui.historyViewId = String(VAULT.state.ui.historyViewId || '');
  VAULT.state.ui.newDraft = normalizeDraft(VAULT.state.ui.newDraft, 'coding');
  VAULT.state.ui.editDrafts = VAULT.state.ui.editDrafts && typeof VAULT.state.ui.editDrafts === 'object'
    ? VAULT.state.ui.editDrafts
    : Object.create(null);
  VAULT.state.pending = VAULT.state.pending && typeof VAULT.state.pending === 'object'
    ? VAULT.state.pending
    : { toolbar: false, modes: false, profiles: false, list: false, preview: false, menus: false, rows: new Set() };
  if (!(VAULT.state.pending.rows instanceof Set)) VAULT.state.pending.rows = new Set();
  const S = VAULT.state;

  function normalizeDraft(raw, fallbackProfile = 'coding') {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      title: String(src.title || ''),
      text: String(src.text || ''),
      tags: String(src.tags || ''),
      active: src.active === true,
      pinned: !!src.pinned,
      profile: normalizeProfile(src.profile || fallbackProfile),
    };
  }

  function escHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cssEscape(value) {
    try { return W.CSS?.escape?.(String(value || '')) || String(value || ''); }
    catch (_) { return String(value || '').replace(/["\\]/g, '\\$&'); }
  }

  function cleanLine(value, maxLen = 0) {
    let text = String(value || '').replace(/\s+/g, ' ').trim();
    if (maxLen > 0 && text.length > maxLen) text = `${text.slice(0, maxLen - 1).trimEnd()}…`;
    return text;
  }

  function cleanBlock(value) {
    return String(value || '')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function previewText(value, maxLen = 140) {
    return cleanLine(cleanBlock(value), maxLen);
  }

  function normalizeProfile(value) {
    const next = String(value || '').trim().toLowerCase();
    return PROFILES.includes(next) ? next : 'coding';
  }

  function normalizeMode(value) {
    const next = String(value || '').trim().toLowerCase();
    return MODES.includes(next) ? next : 'active';
  }

  function normalizeSort(value) {
    const next = String(value || '').trim().toLowerCase();
    return SORTS.includes(next) ? next : 'manual';
  }

  function normalizeUi(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const expandedRaw = src.expanded && typeof src.expanded === 'object' ? src.expanded : {};
    const expanded = {};
    for (const [key, flag] of Object.entries(expandedRaw)) {
      const id = String(key || '').trim();
      if (!id || !flag) continue;
      expanded[id] = true;
    }
    return {
      mode: normalizeMode(src.mode),
      search: cleanLine(src.search || '', 240),
      profile: normalizeProfile(src.profile),
      selectedId: src.selectedId ? String(src.selectedId) : null,
      expanded,
      sort: normalizeSort(src.sort),
    };
  }

  function labelProfile(profile) {
    const value = normalizeProfile(profile);
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function labelSource(kind) {
    const value = String(kind || 'manual').trim().toLowerCase();
    if (value === 'notes') return 'note';
    if (value === 'highlights') return 'highlight';
    if (value === 'bookmarks') return 'bookmark';
    return value || 'manual';
  }

  function labelSort(sort) {
    const value = normalizeSort(sort);
    if (value === 'updated') return 'Updated';
    if (value === 'created') return 'Created';
    if (value === 'title') return 'Title';
    return 'Manual';
  }

  function pluralize(value, one, many) {
    return Number(value || 0) === 1 ? one : many;
  }

  function formatStamp(ts) {
    const value = Number(ts || 0);
    if (!value) return 'Unknown time';
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(value);
    } catch (_) {
      return new Date(value).toLocaleString();
    }
  }

  async function copyText(value) {
    const text = String(value || '');
    if (!text) return false;

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {}

    try {
      const ta = D.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      D.body.appendChild(ta);
      ta.select();
      D.execCommand('copy');
      ta.remove();
      return true;
    } catch (_) {
      return false;
    }
  }

  function getEngine() {
    return W.H2O_Context || null;
  }

  function getChatId(engine = null) {
    const api = engine || getEngine();
    return String(api?.chatId?.() || W.H2O?.util?.getChatId?.() || 'unknown');
  }

  function themeVarsForDockMode(mode) {
    if (mode === 'side') {
      return {
        card: 'rgba(45,31,18,.82)',
        border: 'rgba(234,136,39,.24)',
        ink: 'rgba(255,247,239,.95)',
        sub: 'rgba(255,225,198,.72)',
        accent: '#f08c2a',
        soft: 'rgba(240,140,42,.15)',
        preview: 'rgba(57,36,17,.92)',
      };
    }
    if (mode === 'body') {
      return {
        card: 'rgba(38,28,19,.74)',
        border: 'rgba(232,128,31,.22)',
        ink: 'rgba(255,248,242,.95)',
        sub: 'rgba(255,228,203,.74)',
        accent: '#e97f1f',
        soft: 'rgba(233,127,31,.15)',
        preview: 'rgba(51,33,18,.90)',
      };
    }
    return {
      card: 'rgba(34,26,18,.78)',
      border: 'rgba(240,140,42,.22)',
      ink: 'rgba(255,248,242,.95)',
      sub: 'rgba(255,228,203,.74)',
      accent: '#f08c2a',
      soft: 'rgba(240,140,42,.15)',
      preview: 'rgba(47,31,17,.92)',
    };
  }

  function ensureStylesOnce() {
    if (D.getElementById(CLS.styleId)) return;
    const style = D.createElement('style');
    style.id = CLS.styleId;
    style.textContent = `
      aside[data-cgxui-view="context"] div[data-cgxui="modebar"],
      aside[data-cgxui-view="context"] .cgxui-dpnl-modebar,
      aside[data-cgxui-view="context"] .ho-dpnl-modebar,
      aside[data-cgxui-view="context"] .cgxui-modebar{ display:none !important; }

      .${CLS.root}{
        --ctx-card: rgba(34,26,18,.78);
        --ctx-border: rgba(240,140,42,.22);
        --ctx-ink: rgba(255,248,242,.95);
        --ctx-sub: rgba(255,228,203,.74);
        --ctx-accent: #f08c2a;
        --ctx-soft: rgba(240,140,42,.15);
        --ctx-preview: rgba(47,31,17,.92);
        display:grid;
        grid-template-rows:auto auto auto minmax(0, 1fr) auto;
        gap:10px;
        height:100%;
        min-height:0;
        padding:10px 8px 14px;
        color:var(--ctx-ink);
        font-size:12px;
      }

      .${CLS.toolbar},
      .${CLS.previewWrap},
      .${CLS.inlineEditor},
      .${CLS.row}{
        background:var(--ctx-card);
        border:1px solid var(--ctx-border);
        border-radius:14px;
        box-shadow:0 14px 34px rgba(0,0,0,.18);
      }

      .${CLS.toolbar},
      .${CLS.previewWrap}{
        padding:12px;
      }

      .${CLS.toolbar}{
        display:grid;
        gap:10px;
      }

      .${CLS.titlebar}{
        display:flex;
        gap:8px;
        align-items:center;
        min-width:0;
      }

      .${CLS.titleIcon}{
        font-size:16px;
        line-height:1;
      }

      .${CLS.titleText}{
        font-size:14px;
        font-weight:800;
        letter-spacing:.01em;
      }

      .${CLS.activeCount}{
        margin-left:auto;
        display:inline-flex;
        align-items:center;
        gap:4px;
        padding:4px 8px;
        border-radius:999px;
        background:var(--ctx-soft);
        border:1px solid rgba(255,255,255,.07);
        color:var(--ctx-ink);
        white-space:nowrap;
      }

      .${CLS.primaryActions},
      .${CLS.modePills},
      .${CLS.profilePills},
      .${CLS.rowActions},
      .${CLS.previewActions},
      .${CLS.menuRow},
      .${CLS.editorButtons}{
        display:flex;
        gap:6px;
        flex-wrap:wrap;
        align-items:center;
      }

      .${CLS.primaryActions}{
        position:relative;
      }

      .${CLS.searchWrap}{
        min-width:0;
      }

      .${CLS.searchInput},
      .${CLS.input},
      .${CLS.textarea},
      .${CLS.select}{
        width:100%;
        appearance:none;
        border:1px solid rgba(255,255,255,.10);
        border-radius:10px;
        background:rgba(255,255,255,.04);
        color:var(--ctx-ink);
        padding:8px 10px;
        font:inherit;
        outline:none;
      }

      .${CLS.textarea}{
        min-height:120px;
        resize:vertical;
        line-height:1.5;
      }

      .${CLS.btn},
      .${CLS.mode},
      .${CLS.profile},
      .${CLS.menuItem},
      .${CLS.rowOrder} button{
        appearance:none;
        border:1px solid rgba(255,255,255,.08);
        border-radius:10px;
        background:rgba(255,255,255,.03);
        color:var(--ctx-ink);
        padding:7px 10px;
        font:inherit;
        cursor:pointer;
      }

      .${CLS.btn}[disabled],
      .${CLS.mode}[disabled],
      .${CLS.profile}[disabled],
      .${CLS.rowOrder} button[disabled]{
        opacity:.46;
        cursor:default;
      }

      .${CLS.btnPrimary},
      .${CLS.mode}.isActive,
      .${CLS.profile}.isActive{
        background:var(--ctx-soft);
        border-color:rgba(240,140,42,.42);
      }

      .${CLS.btnInsert}{
        font-weight:700;
      }

      .${CLS.btnGhost}{
        background:transparent;
      }

      .${CLS.btnDanger}{
        border-color:rgba(239,68,68,.25);
        color:rgba(254,226,226,.96);
      }

      .${CLS.menuWrap},
      .${CLS.rowMenuAnchor}{
        position:relative;
      }

      .${CLS.menuPanel}{
        position:absolute;
        top:calc(100% + 6px);
        right:0;
        z-index:8;
        min-width:188px;
        padding:8px;
        border-radius:14px;
        background:rgba(20,15,11,.97);
        border:1px solid rgba(240,140,42,.24);
        box-shadow:0 20px 44px rgba(0,0,0,.32);
        display:grid;
        gap:8px;
      }

      .${CLS.menuPanel}[hidden]{
        display:none !important;
      }

      .${CLS.menuGroup}{
        display:grid;
        gap:6px;
      }

      .${CLS.menuTitle},
      .${CLS.sectionLabel},
      .${CLS.label},
      .${CLS.subtle}{
        color:var(--ctx-sub);
      }

      .${CLS.menuTitle},
      .${CLS.sectionLabel},
      .${CLS.label}{
        font-size:11px;
      }

      .${CLS.menuItem}{
        width:100%;
        text-align:left;
        background:rgba(255,255,255,.02);
      }

      .${CLS.menuItem}.isActive{
        background:var(--ctx-soft);
        border-color:rgba(240,140,42,.38);
      }

      .${CLS.listWrap}{
        min-height:0;
        overflow:auto;
        display:grid;
        gap:10px;
        padding-right:2px;
      }

      .${CLS.row}{
        display:grid;
        grid-template-columns:auto minmax(0,1fr) auto;
        gap:10px;
        align-items:start;
        padding:10px;
      }

      .${CLS.row}.isHistory{
        grid-template-columns:minmax(0,1fr) auto;
        opacity:.94;
      }

      .${CLS.rowOrder}{
        display:grid;
        gap:6px;
        align-content:start;
      }

      .${CLS.activeDot}{
        width:12px;
        height:12px;
        border-radius:999px;
        background:rgba(255,255,255,.10);
        border:1px solid rgba(255,255,255,.08);
        box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);
        margin-top:4px;
      }

      .${CLS.activeDot}.isOn{
        background:var(--ctx-accent);
        border-color:rgba(240,140,42,.48);
        box-shadow:0 0 0 3px rgba(240,140,42,.16);
      }

      .${CLS.rowBody}{
        min-width:0;
        display:grid;
        gap:6px;
        cursor:pointer;
      }

      .${CLS.rowTitle}{
        font-weight:700;
        font-size:13px;
        line-height:1.35;
      }

      .${CLS.rowPreview}{
        color:var(--ctx-sub);
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .${CLS.rowMeta},
      .${CLS.historyMeta}{
        display:flex;
        gap:6px;
        flex-wrap:wrap;
        align-items:center;
      }

      .${CLS.tag},
      .${CLS.sourceBadge},
      .${CLS.profileBadge}{
        display:inline-flex;
        align-items:center;
        padding:3px 8px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.06);
        background:rgba(255,255,255,.04);
        color:var(--ctx-sub);
        line-height:1.2;
      }

      .${CLS.rowActions}{
        justify-content:flex-end;
      }

      .${CLS.rowExpanded}{
        grid-column:1 / -1;
        margin:0;
        padding:10px;
        border-radius:12px;
        border:1px solid rgba(255,255,255,.06);
        background:rgba(255,255,255,.03);
        color:var(--ctx-ink);
        white-space:pre-wrap;
        line-height:1.5;
        overflow:auto;
      }

      .${CLS.inlineEditor}{
        grid-column:1 / -1;
        display:grid;
        gap:10px;
        padding:12px;
      }

      .${CLS.editorGrid}{
        display:grid;
        gap:8px;
        grid-template-columns:repeat(2, minmax(0, 1fr));
      }

      .${CLS.field}{
        display:grid;
        gap:6px;
      }

      .${CLS.editorSource}{
        display:grid;
        gap:6px;
        padding:10px;
        border-radius:12px;
        border:1px solid rgba(255,255,255,.06);
        background:rgba(255,255,255,.025);
      }

      .${CLS.emptyState}{
        padding:18px 14px;
        border:1px dashed rgba(240,140,42,.28);
        border-radius:14px;
        background:rgba(255,255,255,.02);
        color:var(--ctx-sub);
        text-align:center;
      }

      .${CLS.previewWrap}{
        display:grid;
        gap:10px;
        background:var(--ctx-preview);
      }

      .${CLS.previewTitle}{
        font-weight:800;
      }

      .${CLS.previewBox}{
        margin:0;
        min-height:104px;
        max-height:188px;
        overflow:auto;
        padding:10px;
        border-radius:12px;
        border:1px solid rgba(255,255,255,.06);
        background:rgba(255,255,255,.035);
        color:var(--ctx-ink);
        white-space:pre-wrap;
        font:500 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }

      .${CLS.previewWrap}[data-empty="1"] .${CLS.previewBox}{
        color:var(--ctx-sub);
      }

      @media (max-width: 720px){
        .${CLS.editorGrid}{
          grid-template-columns:1fr;
        }

        .${CLS.row},
        .${CLS.row}.isHistory{
          grid-template-columns:1fr;
        }

        .${CLS.rowActions}{
          justify-content:flex-start;
        }

        .${CLS.rowOrder}{
          grid-auto-flow:column;
        }

        .${CLS.activeCount}{
          margin-left:0;
        }
      }
    `;
    D.head.appendChild(style);
  }

  function waitForDockPanelApi(maxMs = 7000) {
    const started = Date.now();
    return new Promise((resolve) => {
      (function tick() {
        const api = W.H2O?.DP?.dckpnl?.api || null;
        const ok = !!(api?.getContract && W.H2O?.Dock?.registerTab);
        if (ok) return resolve(api);
        if (Date.now() - started > maxMs) return resolve(null);
        W.requestAnimationFrame(tick);
      })();
    });
  }

  function ensureDockMenuEntry(panelEl) {
    const menu = panelEl?.querySelector?.(`[${DOCK_ATTR.viewMenu}="1"]`);
    if (!menu) return;
    if (menu.querySelector(`[${DOCK_ATTR.setView}="${STR.tabId}"]`)) return;

    const template = menu.querySelector(`button[${DOCK_ATTR.setView}]`);
    const btn = template ? template.cloneNode(true) : D.createElement('button');
    btn.type = 'button';
    btn.textContent = STR.tabTitle;
    btn.setAttribute(DOCK_ATTR.setView, STR.tabId);
    menu.appendChild(btn);
  }

  function ensureDockRailShortcut() {
    const nodes = Array.from(D.querySelectorAll(`[${DOCK_ATTR.railView}="${STR.railSlotId}"]`));
    for (const node of nodes) {
      node.setAttribute(DOCK_ATTR.railView, STR.tabId);
      node.removeAttribute(DOCK_ATTR.railDummy);
      if (node instanceof HTMLElement) node.title = STR.tabTitle;

      const badge = node.querySelector?.('[class*="rail-nav-btn"]') || null;
      if (badge instanceof HTMLElement) {
        badge.style.setProperty('--cgxui-btn-bg', '#c97822');
        badge.style.fontWeight = '700';
        badge.style.fontSize = '11px';
        badge.textContent = 'C';
      }
    }
  }

  function migrateLegacyDockView(apiDock) {
    if (!apiDock?.getContract) return;

    const contract = apiDock.getContract();
    const helpers = contract?.helpers || {};
    const key = contract?.disk?.KEY_DPANEL_STATE_PANEL_V1 || '';
    if (!key) return;

    if (String(apiDock.getView?.() || '') === STR.railSlotId) {
      try { apiDock.setView?.(STR.tabId); } catch (_) {}
    }

    try {
      const raw = helpers.lsGet?.(key);
      const state = helpers.jsonParse?.(raw, null);
      if (!state || typeof state !== 'object' || state.view !== STR.railSlotId) return;
      helpers.lsSet?.(key, JSON.stringify({ ...state, view: STR.tabId }));
    } catch (_) {}
  }

  function ensureDockLaunchers(panelEl = null) {
    ensureDockRailShortcut();
    if (panelEl) ensureDockMenuEntry(panelEl);
    else Array.from(D.querySelectorAll('aside[data-cgxui-view], aside[data-cgxui-owner]')).forEach((panel) => ensureDockMenuEntry(panel));
  }

  function bindDockAugmenter() {
    if (S.railMo) return;
    ensureDockLaunchers();

    if (typeof MutationObserver !== 'function') return;
    S.railMo = new MutationObserver(() => ensureDockLaunchers());
    S.railMo.observe(D.documentElement, { childList: true, subtree: true });
  }

  function requestRender(apiDock = S.dockApi) {
    try { apiDock?.requestRender?.(); } catch (_) {}
  }

  function canPatchLocally() {
    return !!(S.mount?.root && S.mount?.listEl && S.mount.root.isConnected && D.contains(S.mount.root) && D.contains(S.mount.listEl));
  }

  function resetPending() {
    S.pending.toolbar = false;
    S.pending.modes = false;
    S.pending.profiles = false;
    S.pending.list = false;
    S.pending.preview = false;
    S.pending.menus = false;
    S.pending.rows.clear();
  }

  function queuePatch(spec = {}) {
    if (!canPatchLocally()) {
      requestRender();
      return;
    }

    if (spec.all) {
      S.pending.toolbar = true;
      S.pending.modes = true;
      S.pending.profiles = true;
      S.pending.list = true;
      S.pending.preview = true;
      S.pending.menus = true;
      S.pending.rows.clear();
    }
    if (spec.toolbar) S.pending.toolbar = true;
    if (spec.modes) S.pending.modes = true;
    if (spec.profiles) S.pending.profiles = true;
    if (spec.list) S.pending.list = true;
    if (spec.preview) S.pending.preview = true;
    if (spec.menus) S.pending.menus = true;
    if (spec.row) S.pending.rows.add(String(spec.row));
    if (Array.isArray(spec.rows)) spec.rows.forEach((id) => id && S.pending.rows.add(String(id)));

    if (S.patchRaf) return;
    S.patchRaf = W.requestAnimationFrame(() => {
      S.patchRaf = 0;
      flushPatch();
    });
  }

  function applyTheme(root, bg) {
    if (!root) return;
    const vars = themeVarsForDockMode(bg);
    root.style.setProperty('--ctx-card', vars.card);
    root.style.setProperty('--ctx-border', vars.border);
    root.style.setProperty('--ctx-ink', vars.ink);
    root.style.setProperty('--ctx-sub', vars.sub);
    root.style.setProperty('--ctx-accent', vars.accent);
    root.style.setProperty('--ctx-soft', vars.soft);
    root.style.setProperty('--ctx-preview', vars.preview);
  }

  function shellHtml() {
    return `
      <div class="${CLS.root}">
        <div class="${CLS.toolbar}">
          <div class="${CLS.titlebar}">
            <span class="${CLS.titleIcon}">🧠</span>
            <span class="${CLS.titleText}">${STR.tabTitle}</span>
            <span class="${CLS.activeCount}">0 active</span>
          </div>
          <div class="${CLS.primaryActions}">
            <button type="button" class="${CLS.btn} ${CLS.btnNew}" ${ATTR.act}="new">+ New</button>
            <button type="button" class="${CLS.btn} ${CLS.btnPrimary} ${CLS.btnInsert}" ${ATTR.act}="insert-active">Insert Active</button>
            <button type="button" class="${CLS.btn} ${CLS.btnCopy}" ${ATTR.act}="copy-active">Copy Active</button>
            <div class="${CLS.menuWrap}">
              <button type="button" class="${CLS.btn} ${CLS.btnMenu}" ${ATTR.act}="toggle-menu">⋯</button>
              <div class="${CLS.menuPanel}" ${ATTR.menu}="top" hidden></div>
            </div>
          </div>
          <div class="${CLS.searchWrap}">
            <input class="${CLS.searchInput}" ${ATTR.search}="1" placeholder="${escHtml(STR.searchPh)}">
          </div>
        </div>
        <div class="${CLS.modePills}"></div>
        <div class="${CLS.profilePills}"></div>
        <div class="${CLS.listWrap}"></div>
        <div class="${CLS.previewWrap}" data-empty="1">
          <div class="${CLS.previewTitle}">${STR.previewTitle}</div>
          <pre class="${CLS.previewBox}"></pre>
          <div class="${CLS.previewActions}">
            <button type="button" class="${CLS.btn} ${CLS.btnPrimary}" ${ATTR.act}="preview-append">Append</button>
            <button type="button" class="${CLS.btn}" ${ATTR.act}="preview-replace">Replace</button>
            <button type="button" class="${CLS.btn}" ${ATTR.act}="preview-copy">Copy</button>
          </div>
        </div>
      </div>
    `;
  }

  function captureRefs(root) {
    return {
      root,
      toolbar: root.querySelector(`.${CLS.toolbar}`),
      titlebar: root.querySelector(`.${CLS.titlebar}`),
      activeCount: root.querySelector(`.${CLS.activeCount}`),
      primaryActions: root.querySelector(`.${CLS.primaryActions}`),
      topMenu: root.querySelector(`.${CLS.menuPanel}[${ATTR.menu}="top"]`),
      searchInput: root.querySelector(`.${CLS.searchInput}`),
      modePills: root.querySelector(`.${CLS.modePills}`),
      profilePills: root.querySelector(`.${CLS.profilePills}`),
      listWrap: root.querySelector(`.${CLS.listWrap}`),
      previewWrap: root.querySelector(`.${CLS.previewWrap}`),
      previewBox: root.querySelector(`.${CLS.previewBox}`),
      previewActions: root.querySelector(`.${CLS.previewActions}`),
    };
  }

  function connectMount(ctx, apiDock) {
    const listEl = ctx?.listEl || null;
    if (!listEl) return null;

    ensureStylesOnce();
    ensureDockLaunchers(ctx?.panelEl || null);

    const needsShell = !S.mount.root || S.mount.listEl !== listEl || !listEl.contains(S.mount.root);
    if (needsShell) {
      listEl.innerHTML = shellHtml();
      const root = listEl.querySelector(`.${CLS.root}`);
      S.mount = {
        panelEl: ctx?.panelEl || null,
        listEl,
        root,
        refs: captureRefs(root),
        bg: ctx?.state?.bg || 'bar',
      };
      bindListHandlersOnce(listEl, apiDock);
    } else {
      S.mount.panelEl = ctx?.panelEl || S.mount.panelEl || null;
      S.mount.listEl = listEl;
      S.mount.bg = ctx?.state?.bg || S.mount.bg || 'bar';
      S.mount.refs = captureRefs(S.mount.root);
    }

    applyTheme(S.mount.root, S.mount.bg);
    return S.mount;
  }

  function topMenuHtml(vm) {
    return `
      <div class="${CLS.menuGroup}">
        <button type="button" class="${CLS.menuItem}" ${ATTR.act}="promote-notes">${STR.promoteNotes}</button>
        <button type="button" class="${CLS.menuItem}" ${ATTR.act}="promote-highlights">${STR.promoteHighlights}</button>
        <button type="button" class="${CLS.menuItem}" ${ATTR.act}="promote-bookmarks">${STR.promoteBookmarks}</button>
        <button type="button" class="${CLS.menuItem}" ${ATTR.act}="clear-history">${STR.clearHistory}</button>
        <button type="button" class="${CLS.menuItem}" ${ATTR.act}="export-json">${STR.exportJson}</button>
      </div>
      <div class="${CLS.menuGroup}">
        <div class="${CLS.menuTitle}">${STR.sortTitle}</div>
        <div class="${CLS.menuRow}">
          ${SORTS.map((sort) => `
            <button
              type="button"
              class="${CLS.menuItem} ${vm.ui.sort === sort ? 'isActive' : ''}"
              ${ATTR.sort}="${sort}">${escHtml(labelSort(sort))}</button>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderModePills(vm) {
    return MODES.map((mode) => `
      <button
        type="button"
        class="${CLS.mode} ${vm.ui.mode === mode ? 'isActive' : ''}"
        ${ATTR.mode}="${mode}">${escHtml(mode.charAt(0).toUpperCase() + mode.slice(1))}</button>
    `).join('');
  }

  function renderProfilePills(vm) {
    return PROFILES.map((profile) => `
      <button
        type="button"
        class="${CLS.profile} ${vm.ui.profile === profile ? 'isActive' : ''}"
        ${ATTR.profile}="${profile}">${escHtml(labelProfile(profile))}</button>
    `).join('');
  }

  function renderSourceReadOnly(source) {
    const kind = labelSource(source?.kind || 'manual');
    const id = cleanLine(source?.id || '', 80);
    const msgId = cleanLine(source?.msgId || '', 80);
    const parts = [
      `Kind: ${kind}`,
      id ? `ID: ${id}` : '',
      msgId ? `Msg: ${msgId}` : '',
    ].filter(Boolean);
    return `
      <div class="${CLS.editorSource}">
        <div class="${CLS.label}">Source</div>
        <div>${escHtml(parts.join(' · ') || 'Kind: manual')}</div>
      </div>
    `;
  }

  function renderNewEditor(vm) {
    const draft = normalizeDraft(S.ui.newDraft, vm.ui.profile);
    return `
      <div class="${CLS.inlineEditor}" data-ctx-inline="new">
        <div class="${CLS.editorGrid}">
          <label class="${CLS.field}">
            <span class="${CLS.label}">Title</span>
            <input class="${CLS.input}" ${ATTR.draftField}="title" value="${escHtml(draft.title)}" placeholder="Reusable block title">
          </label>
          <label class="${CLS.field}">
            <span class="${CLS.label}">Profile</span>
            <select class="${CLS.select}" ${ATTR.draftField}="profile">
              ${PROFILES.map((profile) => `<option value="${profile}" ${draft.profile === profile ? 'selected' : ''}>${escHtml(labelProfile(profile))}</option>`).join('')}
            </select>
          </label>
        </div>
        <label class="${CLS.field}">
          <span class="${CLS.label}">Text</span>
          <textarea class="${CLS.textarea}" ${ATTR.draftField}="text" placeholder="Prompt-ready context block">${escHtml(draft.text)}</textarea>
        </label>
        <label class="${CLS.field}">
          <span class="${CLS.label}">Tags</span>
          <input class="${CLS.input}" ${ATTR.draftField}="tags" value="${escHtml(draft.tags)}" placeholder="comma, separated, tags">
        </label>
        ${renderSourceReadOnly({ kind: 'manual', id: '', msgId: '' })}
        <div class="${CLS.editorButtons}">
          <button type="button" class="${CLS.btn} ${CLS.btnPrimary}" ${ATTR.act}="save-new">Save</button>
          <button type="button" class="${CLS.btn}" ${ATTR.act}="cancel-new">Cancel</button>
          <button type="button" class="${CLS.btn}" ${ATTR.act}="save-new-active">Save + Add to Active</button>
        </div>
      </div>
    `;
  }

  function renderEditEditor(vm, item) {
    const draft = normalizeDraft(S.ui.editDrafts[item.id], item.profile || vm.ui.profile);
    return `
      <div class="${CLS.inlineEditor}" data-ctx-inline="edit" ${ATTR.id}="${escHtml(item.id)}">
        <div class="${CLS.editorGrid}">
          <label class="${CLS.field}">
            <span class="${CLS.label}">Title</span>
            <input class="${CLS.input}" ${ATTR.editField}="title" ${ATTR.id}="${escHtml(item.id)}" value="${escHtml(draft.title)}">
          </label>
          <label class="${CLS.field}">
            <span class="${CLS.label}">Profile</span>
            <select class="${CLS.select}" ${ATTR.editField}="profile" ${ATTR.id}="${escHtml(item.id)}">
              ${PROFILES.map((profile) => `<option value="${profile}" ${draft.profile === profile ? 'selected' : ''}>${escHtml(labelProfile(profile))}</option>`).join('')}
            </select>
          </label>
        </div>
        <label class="${CLS.field}">
          <span class="${CLS.label}">Text</span>
          <textarea class="${CLS.textarea}" ${ATTR.editField}="text" ${ATTR.id}="${escHtml(item.id)}">${escHtml(draft.text)}</textarea>
        </label>
        <label class="${CLS.field}">
          <span class="${CLS.label}">Tags</span>
          <input class="${CLS.input}" ${ATTR.editField}="tags" ${ATTR.id}="${escHtml(item.id)}" value="${escHtml(draft.tags)}">
        </label>
        ${renderSourceReadOnly(item.source)}
        <div class="${CLS.editorButtons}">
          <button type="button" class="${CLS.btn} ${CLS.btnPrimary}" ${ATTR.act}="save-edit" ${ATTR.id}="${escHtml(item.id)}">Save</button>
          <button type="button" class="${CLS.btn}" ${ATTR.act}="cancel-edit" ${ATTR.id}="${escHtml(item.id)}">Cancel</button>
          <button type="button" class="${CLS.btn}" ${ATTR.act}="save-edit-active" ${ATTR.id}="${escHtml(item.id)}">Save + Add to Active</button>
        </div>
      </div>
    `;
  }

  function renderItemRow(vm, item) {
    const expanded = !!vm.ui.expanded[item.id];
    const editing = vm.ui.selectedId === item.id;
    const menuOpen = S.ui.rowMenuId === item.id;
    const activeOrderIds = vm.activeOrderIds;
    const orderIndex = activeOrderIds.indexOf(item.id);
    const preview = previewText(item.text || '', 140) || 'No text saved.';
    const source = labelSource(item.source?.kind || 'manual');
    const canJump = !!(item.source?.msgId || item.source?.id);
    const tags = Array.isArray(item.tags) ? item.tags.slice(0, 8) : [];

    const orderHtml = vm.ui.mode === 'active'
      ? `
        <div class="${CLS.rowOrder}">
          <button type="button" class="ctxMoveUp" ${ATTR.act}="move-up" ${ATTR.id}="${escHtml(item.id)}" ${orderIndex > 0 ? '' : 'disabled'}>▲</button>
          <button type="button" class="ctxMoveDown" ${ATTR.act}="move-down" ${ATTR.id}="${escHtml(item.id)}" ${orderIndex >= 0 && orderIndex < activeOrderIds.length - 1 ? '' : 'disabled'}>▼</button>
        </div>
      `
      : `
        <div class="${CLS.rowOrder}">
          <span class="${CLS.activeDot} ${item.active ? 'isOn' : ''}" title="${item.active ? 'Active' : 'Inactive'}"></span>
        </div>
      `;

    const actionToggleLabel = vm.ui.mode === 'active' ? 'Off' : (item.active ? 'Off' : 'Add');
    const profileBadge = item.profile && item.profile !== vm.ui.profile
      ? `<span class="${CLS.profileBadge}">${escHtml(item.profile)}</span>`
      : '';

    return `
      <div class="${CLS.row}" data-ctx-row="item" ${ATTR.id}="${escHtml(item.id)}">
        ${orderHtml}
        <div class="${CLS.rowBody}" ${ATTR.act}="expand" ${ATTR.id}="${escHtml(item.id)}">
          <div class="${CLS.rowTitle}">${escHtml(item.title || previewText(item.text || '', 80) || 'Untitled')}</div>
          <div class="${CLS.rowPreview}">${escHtml(preview)}</div>
          <div class="${CLS.rowMeta}">
            ${tags.map((tag) => `<span class="${CLS.tag}">#${escHtml(tag)}</span>`).join('')}
            <span class="${CLS.sourceBadge}">${escHtml(source)}</span>
            ${profileBadge}
          </div>
        </div>
        <div class="${CLS.rowActions}">
          <button type="button" class="${CLS.btn} ${CLS.btnPrimary}" ${ATTR.act}="insert" ${ATTR.id}="${escHtml(item.id)}">Insert</button>
          <button type="button" class="${CLS.btn}" ${ATTR.act}="edit" ${ATTR.id}="${escHtml(item.id)}">Edit</button>
          <button type="button" class="${CLS.btn}" ${ATTR.act}="jump" ${ATTR.id}="${escHtml(item.id)}" ${canJump ? '' : 'disabled'}>Jump</button>
          <button type="button" class="${CLS.btn}" ${ATTR.act}="toggle-active" ${ATTR.id}="${escHtml(item.id)}">${escHtml(actionToggleLabel)}</button>
          <div class="${CLS.rowMenuAnchor}">
            <button type="button" class="${CLS.btn} ${CLS.rowMenuToggle}" ${ATTR.act}="toggle-row-menu" ${ATTR.id}="${escHtml(item.id)}">⋯</button>
            <div class="${CLS.menuPanel}" ${ATTR.menu}="row:${escHtml(item.id)}" ${menuOpen ? '' : 'hidden'}>
              <div class="${CLS.menuGroup}">
                <button type="button" class="${CLS.menuItem}" ${ATTR.act}="duplicate" ${ATTR.id}="${escHtml(item.id)}">Duplicate</button>
                <button type="button" class="${CLS.menuItem}" ${ATTR.act}="pin" ${ATTR.id}="${escHtml(item.id)}">${item.pinned ? 'Unpin' : 'Pin'}</button>
                <button type="button" class="${CLS.menuItem} ${CLS.btnDanger}" ${ATTR.act}="delete" ${ATTR.id}="${escHtml(item.id)}">Delete</button>
              </div>
            </div>
          </div>
        </div>
        ${expanded ? `<pre class="${CLS.rowExpanded}">${escHtml(cleanBlock(item.text || '') || 'No text saved.')}</pre>` : ''}
        ${editing ? renderEditEditor(vm, item) : ''}
      </div>
    `;
  }

  function renderHistoryRow(row) {
    const open = S.ui.historyViewId === row.id;
    const resolved = cleanBlock(row.resolvedText || row.text || '');
    return `
      <div class="${CLS.row} isHistory" data-ctx-row="history" ${ATTR.id}="${escHtml(row.id)}">
        <div class="${CLS.rowBody}" ${ATTR.act}="view-history" ${ATTR.id}="${escHtml(row.id)}">
          <div class="${CLS.rowTitle}">${escHtml(formatStamp(row.insertedAt))}</div>
          <div class="${CLS.rowPreview}">${escHtml(row.preview || previewText(resolved, 140) || 'No stored preview.')}</div>
          <div class="${CLS.historyMeta}">
            <span class="${CLS.sourceBadge}">${escHtml(row.actualMode || row.requestedMode || 'append')}</span>
            <span class="${CLS.sourceBadge}">${escHtml(`${row.count} ${pluralize(row.count, 'item', 'items')}`)}</span>
            <span class="${CLS.sourceBadge}">${escHtml(row.kind || 'active')}</span>
          </div>
        </div>
        <div class="${CLS.rowActions}">
          <button type="button" class="${CLS.btn} ${CLS.btnPrimary}" ${ATTR.act}="reinsert-history" ${ATTR.id}="${escHtml(row.id)}">Reinsert</button>
          <button type="button" class="${CLS.btn}" ${ATTR.act}="view-history" ${ATTR.id}="${escHtml(row.id)}">${open ? 'Hide' : 'View'}</button>
        </div>
        ${open ? `<pre class="${CLS.rowExpanded}">${escHtml(resolved || 'No stored text.')}</pre>` : ''}
      </div>
    `;
  }

  function renderEmptyState(mode) {
    const text = mode === 'active'
      ? STR.emptyActive
      : mode === 'history'
        ? STR.emptyHistory
        : STR.emptyLibrary;
    return `<div class="${CLS.emptyState}">${escHtml(text)}</div>`;
  }

  function renderList(vm) {
    const parts = [];
    if (S.ui.newOpen) parts.push(renderNewEditor(vm));

    if (vm.missingEngine) {
      parts.push(`<div class="${CLS.emptyState}">${STR.emptyEngine}</div>`);
      return parts.join('');
    }

    if (vm.ui.mode === 'history') {
      if (!vm.historyItems.length) parts.push(renderEmptyState('history'));
      else parts.push(vm.historyItems.map((row) => renderHistoryRow(row)).join(''));
      return parts.join('');
    }

    const items = vm.ui.mode === 'active' ? vm.activeItems : vm.libraryItems;
    if (!items.length) parts.push(renderEmptyState(vm.ui.mode));
    else parts.push(items.map((item) => renderItemRow(vm, item)).join(''));
    return parts.join('');
  }

  function ensureDraftProfile(vm) {
    if (!S.ui.newDraft?.profile) S.ui.newDraft = normalizeDraft(S.ui.newDraft, vm.ui.profile);
  }

  function buildVm() {
    const engine = getEngine();
    if (!engine) {
      return {
        missingEngine: true,
        engine: null,
        chatId: 'unknown',
        ui: normalizeUi(null),
        activeCount: 0,
        activeItems: [],
        libraryItems: [],
        historyItems: [],
        activeOrderIds: [],
        previewText: '',
      };
    }

    const chatId = getChatId(engine);
    const ui = normalizeUi(engine.getUi(chatId));
    const activeItems = engine.list(chatId, {
      profile: ui.profile,
      activeOnly: true,
      sort: 'manual',
      search: ui.search,
    });
    const libraryItems = engine.list(chatId, {
      profile: ui.profile,
      search: ui.search,
      sort: ui.mode === 'active' ? 'manual' : ui.sort,
    });
    const historyItems = engine.listHistory(chatId, {
      profile: ui.profile,
      search: ui.search,
    });
    const activeOrderIds = engine.list(chatId, {
      profile: ui.profile,
      activeOnly: true,
      sort: 'manual',
    }).map((item) => item.id);
    const previewTextValue = String(engine.buildActiveText(chatId, { profile: ui.profile }) || '');

    if (ui.mode === 'history') {
      S.ui.rowMenuId = '';
      if (S.ui.historyViewId && !historyItems.some((row) => row.id === S.ui.historyViewId)) S.ui.historyViewId = '';
    } else {
      const visibleIds = new Set((ui.mode === 'active' ? activeItems : libraryItems).map((item) => item.id));
      if (S.ui.rowMenuId && !visibleIds.has(S.ui.rowMenuId)) S.ui.rowMenuId = '';
      S.ui.historyViewId = '';
    }

    ensureDraftProfile({ ui });

    return {
      missingEngine: false,
      engine,
      chatId,
      ui,
      activeCount: activeOrderIds.length,
      activeItems,
      libraryItems,
      historyItems,
      activeOrderIds,
      previewText: previewTextValue,
    };
  }

  function patchToolbar(vm) {
    const refs = S.mount?.refs;
    if (!refs) return;

    refs.activeCount.textContent = `${vm.activeCount} active`;

    const hasPreview = !!cleanBlock(vm.previewText || '');
    refs.primaryActions.querySelector(`[${ATTR.act}="insert-active"]`)?.toggleAttribute('disabled', !hasPreview);
    refs.primaryActions.querySelector(`[${ATTR.act}="copy-active"]`)?.toggleAttribute('disabled', !hasPreview);

    if (refs.searchInput && D.activeElement !== refs.searchInput && refs.searchInput.value !== vm.ui.search) {
      refs.searchInput.value = vm.ui.search || '';
    }

    if (refs.topMenu) {
      refs.topMenu.innerHTML = topMenuHtml(vm);
      refs.topMenu.hidden = !S.ui.menuOpen;
    }
  }

  function patchModePills(vm) {
    const host = S.mount?.refs?.modePills;
    if (host) host.innerHTML = renderModePills(vm);
  }

  function patchProfilePills(vm) {
    const host = S.mount?.refs?.profilePills;
    if (host) host.innerHTML = renderProfilePills(vm);
  }

  function patchList(vm, force = false) {
    const host = S.mount?.refs?.listWrap;
    if (!host) return;
    if (!force && !host.childElementCount && !S.ui.newOpen) return;
    host.innerHTML = renderList(vm);
  }

  function htmlToElement(html) {
    const tpl = D.createElement('template');
    tpl.innerHTML = String(html || '').trim();
    return tpl.content.firstElementChild || null;
  }

  function patchRow(vm, id) {
    const host = S.mount?.refs?.listWrap;
    if (!host || !id || vm.missingEngine) return;

    const selector = `.${CLS.row}[${ATTR.id}="${cssEscape(id)}"]`;
    const rowEl = host.querySelector(selector);
    if (!rowEl) {
      patchList(vm, true);
      return;
    }

    if (vm.ui.mode === 'history') {
      const row = vm.historyItems.find((entry) => entry.id === id);
      if (!row) {
        patchList(vm, true);
        return;
      }
      const next = htmlToElement(renderHistoryRow(row));
      if (next) rowEl.replaceWith(next);
      return;
    }

    const item = (vm.ui.mode === 'active' ? vm.activeItems : vm.libraryItems).find((entry) => entry.id === id);
    if (!item) {
      patchList(vm, true);
      return;
    }

    const next = htmlToElement(renderItemRow(vm, item));
    if (next) rowEl.replaceWith(next);
  }

  function patchInlineEditor(vm, ids = []) {
    if (S.ui.newOpen) {
      patchList(vm, true);
      return;
    }
    const uniq = Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean)));
    if (!uniq.length) return;
    uniq.forEach((id) => patchRow(vm, id));
  }

  function patchPreview(vm) {
    const refs = S.mount?.refs;
    if (!refs?.previewWrap || !refs.previewBox || !refs.previewActions) return;
    const text = cleanBlock(vm.previewText || '');
    refs.previewWrap.setAttribute('data-empty', text ? '0' : '1');
    refs.previewBox.textContent = text || STR.emptyPreview;
    refs.previewActions.querySelector(`[${ATTR.act}="preview-append"]`)?.toggleAttribute('disabled', !text);
    refs.previewActions.querySelector(`[${ATTR.act}="preview-replace"]`)?.toggleAttribute('disabled', !text);
    refs.previewActions.querySelector(`[${ATTR.act}="preview-copy"]`)?.toggleAttribute('disabled', !text);
  }

  function patchMenus(vm) {
    const refs = S.mount?.refs;
    if (!refs?.topMenu) return;
    refs.topMenu.hidden = !S.ui.menuOpen;
    if (!refs.topMenu.innerHTML.trim()) refs.topMenu.innerHTML = topMenuHtml(vm);
  }

  function flushPatch() {
    if (!canPatchLocally()) {
      resetPending();
      return;
    }

    const vm = buildVm();
    applyTheme(S.mount.root, S.mount.bg);

    if (vm.missingEngine) {
      patchToolbar(vm);
      patchModePills(vm);
      patchProfilePills(vm);
      patchList(vm, true);
      patchPreview(vm);
      patchMenus(vm);
      resetPending();
      return;
    }

    if (S.pending.toolbar) patchToolbar(vm);
    if (S.pending.modes) patchModePills(vm);
    if (S.pending.profiles) patchProfilePills(vm);
    if (S.pending.list) patchList(vm, true);
    else if (S.pending.rows.size) Array.from(S.pending.rows).forEach((id) => patchRow(vm, id));
    if (S.pending.preview) patchPreview(vm);
    if (S.pending.menus) patchMenus(vm);

    resetPending();
  }

  function renderContextTab(ctx, contract, apiDock) {
    const mount = connectMount(ctx, apiDock);
    if (!mount) return;

    S.dockApi = apiDock;
    queuePatch({ all: true });

    const vm = buildVm();
    patchToolbar(vm);
    patchModePills(vm);
    patchProfilePills(vm);
    patchList(vm, true);
    patchPreview(vm);
    patchMenus(vm);
    resetPending();
  }

  function openEditDraft(engine, chatId, id) {
    const item = engine.get(chatId, id);
    if (!item) return null;
    const prev = normalizeUi(engine.getUi(chatId)).selectedId;
    S.ui.editDrafts[id] = normalizeDraft({
      title: item.title || '',
      text: item.text || '',
      tags: Array.isArray(item.tags) ? item.tags.join(', ') : '',
      active: item.active === true,
      pinned: !!item.pinned,
      profile: item.profile || 'coding',
    }, item.profile || 'coding');
    engine.setUi(chatId, { selectedId: id }, 'edit-open');
    return prev;
  }

  function closeEditDraft(engine, chatId, id) {
    const prev = normalizeUi(engine.getUi(chatId)).selectedId;
    delete S.ui.editDrafts[id];
    if (prev === id) engine.setUi(chatId, { selectedId: null }, 'edit-close');
    return prev;
  }

  function patchEditDraft(id, field, value) {
    const current = normalizeDraft(S.ui.editDrafts[id], 'coding');
    S.ui.editDrafts[id] = {
      ...current,
      [field]: value,
    };
  }

  function patchNewDraft(field, value) {
    S.ui.newDraft = {
      ...normalizeDraft(S.ui.newDraft, 'coding'),
      [field]: value,
    };
  }

  function buildPatchFromDraft(draft, forceActive = false) {
    const next = normalizeDraft(draft, 'coding');
    return {
      title: String(next.title || '').trim(),
      text: String(next.text || '').trim(),
      tags: String(next.tags || ''),
      active: forceActive ? true : next.active === true,
      pinned: !!next.pinned,
      profile: normalizeProfile(next.profile),
    };
  }

  function moveActive(engine, chatId, id, dir) {
    const ui = normalizeUi(engine.getUi(chatId));
    const ordered = engine.list(chatId, { profile: ui.profile, activeOnly: true, sort: 'manual' }).map((item) => item.id);
    const index = ordered.indexOf(id);
    if (index < 0) return false;
    const swapIndex = dir < 0 ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= ordered.length) return false;
    const next = ordered.slice();
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    engine.reorder(chatId, next);
    return true;
  }

  function toggleExpanded(engine, chatId, id) {
    const ui = normalizeUi(engine.getUi(chatId));
    const expanded = { ...(ui.expanded || {}) };
    if (expanded[id]) delete expanded[id];
    else expanded[id] = true;
    engine.setUi(chatId, { expanded }, 'expand');
  }

  function handleOutsideMenuClick(target) {
    const insideMenu = !!target.closest?.(`[${ATTR.menu}]`);
    const isEditorLike = !!target.closest?.('input, textarea, select, button, a, label');
    if (!insideMenu && !isEditorLike && (S.ui.menuOpen || S.ui.rowMenuId)) {
      const prevRowMenu = S.ui.rowMenuId;
      S.ui.menuOpen = false;
      S.ui.rowMenuId = '';
      queuePatch({ menus: true, rows: prevRowMenu ? [prevRowMenu] : [] });
    }
  }

  function bindListHandlersOnce(listEl, apiDock) {
    if (S.boundLists.has(listEl)) return;
    S.boundLists.add(listEl);

    listEl.addEventListener('click', (ev) => {
      const target = ev.target;
      if (!(target instanceof Element)) return;

      const engine = getEngine();
      const chatId = getChatId(engine);

      const mode = target.closest?.(`[${ATTR.mode}]`)?.getAttribute(ATTR.mode) || '';
      if (mode && engine) {
        ev.preventDefault();
        S.ui.menuOpen = false;
        S.ui.rowMenuId = '';
        engine.setUi(chatId, { mode }, 'mode');
        queuePatch({ modes: true, list: true, menus: true });
        return;
      }

      const profile = target.closest?.(`[${ATTR.profile}]`)?.getAttribute(ATTR.profile) || '';
      if (profile && engine) {
        ev.preventDefault();
        S.ui.menuOpen = false;
        S.ui.rowMenuId = '';
        engine.setUi(chatId, { profile }, 'profile');
        if (!S.ui.newOpen) S.ui.newDraft.profile = normalizeProfile(profile);
        queuePatch({ toolbar: true, profiles: true, list: true, preview: true, menus: true });
        return;
      }

      const sort = target.closest?.(`[${ATTR.sort}]`)?.getAttribute(ATTR.sort) || '';
      if (sort && engine) {
        ev.preventDefault();
        engine.setUi(chatId, { sort }, 'sort');
        queuePatch({ toolbar: true, list: true, menus: true });
        return;
      }

      const act = target.closest?.(`[${ATTR.act}]`)?.getAttribute(ATTR.act) || '';
      const id = target.closest?.(`[${ATTR.id}]`)?.getAttribute(ATTR.id) || target.getAttribute(ATTR.id) || '';

      if (!act) {
        handleOutsideMenuClick(target);
        return;
      }

      ev.preventDefault();
      ev.stopPropagation();
      if (!engine) {
        requestRender(apiDock);
        return;
      }

      const run = async () => {
        if (act !== 'toggle-menu') S.ui.menuOpen = false;
        if (act !== 'toggle-row-menu') S.ui.rowMenuId = '';

        if (act === 'new') {
          const closing = S.ui.newOpen;
          S.ui.newOpen = !S.ui.newOpen;
          if (!closing) {
            S.ui.newDraft = normalizeDraft({
              title: '',
              text: '',
              tags: '',
              active: false,
              pinned: false,
              profile: normalizeUi(engine.getUi(chatId)).profile,
            }, normalizeUi(engine.getUi(chatId)).profile);
            const currentSelected = normalizeUi(engine.getUi(chatId)).selectedId;
            if (currentSelected) engine.setUi(chatId, { selectedId: null }, 'new-open');
          }
          queuePatch({ list: true, menus: true });
          return;
        }

        if (act === 'cancel-new') {
          S.ui.newOpen = false;
          queuePatch({ list: true });
          return;
        }

        if (act === 'save-new' || act === 'save-new-active') {
          const patch = buildPatchFromDraft(S.ui.newDraft, act === 'save-new-active');
          const saved = engine.add(chatId, {
            ...patch,
            source: { kind: 'manual', id: '', msgId: '', snapshot: null },
          });
          if (saved) {
            S.ui.newOpen = false;
            S.ui.newDraft = normalizeDraft(null, normalizeUi(engine.getUi(chatId)).profile);
          }
          queuePatch({ toolbar: true, list: true, preview: true });
          return;
        }

        if (act === 'toggle-menu') {
          S.ui.menuOpen = !S.ui.menuOpen;
          if (S.ui.menuOpen) S.ui.rowMenuId = '';
          queuePatch({ toolbar: true, menus: true, rows: id ? [id] : [] });
          return;
        }

        if (act === 'insert-active') {
          S.ui.menuOpen = false;
          await engine.insertActive(chatId, 'append');
          queuePatch({ list: true, menus: true });
          return;
        }

        if (act === 'copy-active') {
          S.ui.menuOpen = false;
          await engine.insertActive(chatId, 'copy');
          queuePatch({ list: true, menus: true });
          return;
        }

        if (act === 'preview-append' || act === 'preview-replace' || act === 'preview-copy') {
          const modeMap = {
            'preview-append': 'append',
            'preview-replace': 'replace',
            'preview-copy': 'copy',
          };
          await engine.insertActive(chatId, modeMap[act] || 'append');
          queuePatch({ list: true });
          return;
        }

        if (act === 'promote-notes' || act === 'promote-highlights' || act === 'promote-bookmarks') {
          const kind = act.replace('promote-', '');
          const ui = normalizeUi(engine.getUi(chatId));
          S.ui.menuOpen = false;
          S.ui.rowMenuId = '';
          const result = engine.promoteFromSource(chatId, { kind, profile: ui.profile });
          if (result?.itemIds?.length) engine.setUi(chatId, { mode: 'library', selectedId: null }, `promote:${kind}`);
          queuePatch({ toolbar: true, modes: true, list: true, preview: true, menus: true });
          return;
        }

        if (act === 'clear-history') {
          S.ui.menuOpen = false;
          engine.clearHistory(chatId);
          queuePatch({ list: true, menus: true });
          return;
        }

        if (act === 'export-json') {
          S.ui.menuOpen = false;
          await copyText(engine.exportJSON?.(chatId) || '');
          queuePatch({ menus: true, toolbar: true });
          return;
        }

        if (!id) return;

        if (act === 'insert') {
          await engine.insertItem(chatId, id, 'append');
          queuePatch({ list: true });
          return;
        }

        if (act === 'toggle-active') {
          engine.toggleActive(chatId, id);
          S.ui.rowMenuId = '';
          queuePatch({ toolbar: true, list: true, preview: true, menus: true });
          return;
        }

        if (act === 'edit') {
          const ui = normalizeUi(engine.getUi(chatId));
          const prev = ui.selectedId;
          const hadNewOpen = S.ui.newOpen;
          S.ui.newOpen = false;
          if (prev === id) closeEditDraft(engine, chatId, id);
          else openEditDraft(engine, chatId, id);
          patchInlineEditor(buildVm(), [prev, id].filter(Boolean));
          queuePatch({ list: hadNewOpen || (prev && prev !== id), rows: [prev, id].filter(Boolean) });
          return;
        }

        if (act === 'cancel-edit') {
          closeEditDraft(engine, chatId, id);
          patchInlineEditor(buildVm(), [id]);
          queuePatch({ rows: [id] });
          return;
        }

        if (act === 'save-edit' || act === 'save-edit-active') {
          const patch = buildPatchFromDraft(S.ui.editDrafts[id], act === 'save-edit-active');
          engine.update(chatId, id, patch);
          closeEditDraft(engine, chatId, id);
          queuePatch({ toolbar: true, list: true, preview: true });
          return;
        }

        if (act === 'duplicate') {
          const dup = engine.duplicate?.(chatId, id);
          S.ui.rowMenuId = '';
          if (dup?.id) openEditDraft(engine, chatId, dup.id);
          queuePatch({ toolbar: true, list: true, preview: true, menus: true });
          return;
        }

        if (act === 'jump') {
          await engine.jumpToSource(chatId, id);
          return;
        }

        if (act === 'delete') {
          delete S.ui.editDrafts[id];
          if (S.ui.rowMenuId === id) S.ui.rowMenuId = '';
          engine.remove(chatId, id);
          queuePatch({ toolbar: true, list: true, preview: true, menus: true });
          return;
        }

        if (act === 'expand') {
          toggleExpanded(engine, chatId, id);
          queuePatch({ rows: [id] });
          return;
        }

        if (act === 'move-up') {
          if (moveActive(engine, chatId, id, -1)) queuePatch({ list: true, preview: true });
          return;
        }

        if (act === 'move-down') {
          if (moveActive(engine, chatId, id, 1)) queuePatch({ list: true, preview: true });
          return;
        }

        if (act === 'toggle-row-menu') {
          const prev = S.ui.rowMenuId;
          S.ui.menuOpen = false;
          S.ui.rowMenuId = prev === id ? '' : id;
          queuePatch({ rows: [prev, id].filter(Boolean), menus: true });
          return;
        }

        if (act === 'pin') {
          const item = engine.get(chatId, id);
          if (!item) return;
          S.ui.rowMenuId = '';
          engine.update(chatId, id, { pinned: !item.pinned });
          queuePatch({ list: true, menus: true });
          return;
        }

        if (act === 'reinsert-history') {
          await engine.reinsertHistory?.(chatId, id);
          queuePatch({ list: true });
          return;
        }

        if (act === 'view-history') {
          const prev = S.ui.historyViewId;
          S.ui.historyViewId = prev === id ? '' : id;
          queuePatch({ rows: [prev, id].filter(Boolean) });
        }
      };

      void run();
    }, true);

    const onDraftInput = (target) => {
      const draftField = target.getAttribute(ATTR.draftField);
      if (draftField) {
        patchNewDraft(draftField, target.value);
        return true;
      }
      const editField = target.getAttribute(ATTR.editField);
      const id = target.getAttribute(ATTR.id) || '';
      if (editField && id) {
        patchEditDraft(id, editField, target.value);
        return true;
      }
      return false;
    };

    listEl.addEventListener('input', (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
      const engine = getEngine();
      if (!engine) return;

      const chatId = getChatId(engine);

      if (target.getAttribute(ATTR.search) === '1') {
        clearTimeout(S.searchT);
        S.searchT = W.setTimeout(() => {
          engine.setUi(chatId, { search: target.value || '' }, 'search');
          queuePatch({ list: true });
        }, 90);
        return;
      }

      onDraftInput(target);
    }, true);

    listEl.addEventListener('change', (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
      onDraftInput(target);
    }, true);
  }

  function handleExternalRefresh(eventName, detail, apiDock) {
    if (!canPatchLocally()) {
      requestRender(apiDock);
      return;
    }

    if (eventName === 'h2o:context:ui-changed') {
      const reason = String(detail?.reason || '');
      if (reason === 'mode') queuePatch({ modes: true, list: true });
      else if (reason === 'profile') queuePatch({ toolbar: true, profiles: true, list: true, preview: true });
      else if (reason === 'search') queuePatch({ list: true });
      else queuePatch({ toolbar: true, list: true, preview: true });
      return;
    }

    if (eventName === 'h2o:context:inserted') {
      queuePatch({ list: true });
      return;
    }

    if (eventName === 'h2o:context:promoted') {
      queuePatch({ toolbar: true, modes: true, list: true, preview: true });
      return;
    }

    queuePatch({ toolbar: true, list: true, preview: true });
  }

  function makeTab(contract, apiDock) {
    return {
      id: STR.tabId,
      title: STR.tabTitle,
      __h2oContextTab: true,
      render(ctx) {
        renderContextTab({
          ...ctx,
          helpers: contract.helpers,
          ui: contract.ui,
          attr: contract.attr,
        }, contract, apiDock);
      },
    };
  }

  function registerTab(apiDock) {
    const Dock = W.H2O?.Dock || W.H2O?.PanelSide || null;
    if (!Dock?.registerTab) return false;
    if (Dock.tabs?.[STR.tabId]?.__h2oContextTab) return true;
    const contract = apiDock.getContract();
    Dock.registerTab(STR.tabId, makeTab(contract, apiDock));
    return true;
  }

  function bindRerenderEvents(apiDock) {
    if (S.eventsBound) return;
    S.eventsBound = true;

    const handler = (ev) => handleExternalRefresh(ev.type, ev?.detail || {}, apiDock);
    [
      'h2o:context:changed',
      'h2o:context:ui-changed',
      'h2o:context:inserted',
      'h2o:context:promoted',
      'h2o:notes:changed',
      'h2o:inline:changed',
      'evt:h2o:inline:changed',
      'h2o:message:remounted',
      'evt:h2o:message:remounted',
    ].forEach((eventName) => {
      try { W.addEventListener(eventName, handler, true); } catch (_) {}
    });
  }

  function scheduleBootRetry() {
    if (S.ready || S.bootRaf) return;
    S.bootRaf = W.requestAnimationFrame(() => {
      S.bootRaf = 0;
      void tryBoot();
    });
  }

  async function tryBoot() {
    if (S.ready) return;
    S.tries += 1;

    const apiDock = await waitForDockPanelApi(1200);
    if (!apiDock) {
      if (S.tries < 180) scheduleBootRetry();
      else DIAG('boot:giveup', { tries: S.tries });
      return;
    }

    try {
      S.dockApi = apiDock;
      S.ready = true;
      ensureStylesOnce();
      bindDockAugmenter();
      bindRerenderEvents(apiDock);
      migrateLegacyDockView(apiDock);

      if (registerTab(apiDock)) {
        ensureDockLaunchers();
        requestRender(apiDock);
        DIAG('boot:registered', { ok: true });
      }
    } catch (err) {
      VAULT.diag.lastError = String(err?.stack || err || '');
      DIAG('boot:crash', VAULT.diag.lastError);
      throw err;
    }
  }

  function boot() {
    if (S.booted) return;
    S.booted = true;

    try {
      VAULT.diag.bootCount += 1;
      VAULT.diag.lastBootAt = Date.now();
      scheduleBootRetry();
    } catch (err) {
      VAULT.diag.lastError = String(err?.stack || err || '');
      DIAG('boot:crash', VAULT.diag.lastError);
      throw err;
    }
  }

  boot();
})();
