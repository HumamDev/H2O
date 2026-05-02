// ==UserScript==
// @h2o-id             3n2a.notes.tab
// @name               3N2a.🟠🗒️ Notes Tab 🗒️
// @namespace          H2O.Premium.CGX.notes.tab
// @author             HumamDev
// @version            2.4.11
// @revision           001
// @build              260304-102754
// @description        Notes tab renderer + bindings + toolbar (Notes-only). Uses Notes Engine. Dock-theme synced. Contract v2 Stage 1 aligned.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* ============================================================================
   * H2O — Notes Dock Tab (Contract v2, Stage 1)
   * - Notes-only toolbar + Notes-only bindings (no Highlights collision)
   * - Dock theme sync (3 bg modes: body/bar/side)
   * - No Dock behavior edits (Notes hides Dock modebar via view-scoped CSS only)
   * - Requires: window.H2ONotes (or legacy HoNotes) + H2O.Dock.registerTab
   * ========================================================================== */

  /* ───────────────────────────── 0) Identity (Contract) ───────────────────────────── */

  const TOK = 'NT';
  const PID = 'ntstb';
  const CID = 'notest';
  const SkID = 'nttb';

  const MODTAG = 'NotesT';
  const SUITE = 'prm';
  const HOST  = 'cgx';

  const DsID = PID;
  const BrID = PID;

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const D = W.document;

  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || {};
  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});
  VAULT.meta = VAULT.meta || { tok: TOK, pid: PID, cid: CID, skid: SkID, modtag: MODTAG, suite: SUITE, host: HOST };

  H2O.KEYS = H2O.KEYS || {};
  H2O.EV   = H2O.EV   || {};
  H2O.SEL  = H2O.SEL  || {};
  H2O.UI   = H2O.UI   || {};

  /* ───────────────────────────── 1) Tokens ───────────────────────────── */

  const NS_DISK = `h2o:${SUITE}:${HOST}:${PID}:nt:root:v1`;
  const NS_GUARD = `${NS_DISK}:guard`;
  const NS_UI    = `${NS_DISK}:ui`;

  const KEY_GUARD_BOOT = `${NS_GUARD}:booted`;

  // Notes-only toolbar state (UI prefs only — never touches Dock/Highlights state)
  const KEY_NT_UI_TBAR_STATE = `${NS_UI}:tbar:state:v1`;

  // Dock Panel state key (read-only for theme sync)
  const KEY_DPANEL_STATE_PANEL_V1 = `h2o:${SUITE}:${HOST}:dckpnl:state:panel:v1`;

  // Sticky store key (from Margin Anchor)
  const KEY_STICKY_STORE = 'h2o:prm:cgx:mrgnnchr:state:pins:v1';
  const EV_MANCHOR_STORE_CHANGED_V1 = 'h2o.ev:prm:cgx:mrgnnchr:store:changed:v1';
  const EV_DPANEL_BG_CHANGED_V1 = 'h2o.ev:prm:cgx:dckpnl:bg:changed:v1';

  const STR_ = Object.freeze({
    tabId: 'notes',
    tabTitle: 'Notes',
    viewKey: 'view',

    apiPrimary: 'H2ONotes',
    apiLegacy: 'HoNotes',

    emptyNoApi: 'Notes Engine not loaded. Enable <b>4F.🟢✏️ Notes Engine</b>.',
  });

  const STR_TBAR_ = Object.freeze({
    searchPh: 'Search notes…',
    sortLbl: 'Sort',
    colorLbl: 'New note color',
    viewAll: 'All',
    viewPinned: 'Pinned',
    viewClips: 'Clips',
    viewSticky: 'Sticky',
    menu: '⋯',
    actExport: 'Export JSON',
    actClearDraft: 'Clear Draft',
    actClearAll: 'Clear All Notes',
  });

  const CFG_ = Object.freeze({
    registerMaxTries: 140,
    debounceMs: 180,
    qMax: 240,
    tbarState0: Object.freeze({
      q: '',
      view: 'all',            // all | pinned | clips | sticky
      sort: 'updated_desc',   // updated_desc | created_desc | title_asc | pinned_first
      newColor: 'auto',       // auto | amber | blue | green | purple | pink | gray
    }),
  });

  const CSS_STYLE_ID = 'cgxui-notes-tab-style-v220';

  const SEL_ = Object.freeze({
    panel: 'aside[data-cgxui="panel"]',
    list:  'div[data-cgxui="list"]',
  });

  const CSS_ = Object.freeze({
  // frame
  wrap: 'cgxui-nt-wrap',
  title: 'cgxui-nt-title',
  ta: 'cgxui-nt-ta',
  trow: 'cgxui-nt-trow',
  swRow: 'cgxui-nt-swrow',
  sw: 'cgxui-nt-sw',
  compose: 'cgxui-nt-compose',

  // header + section
  hdr: 'cgxui-nt-hdr',
  sec: 'cgxui-nt-sec',
  sub: 'cgxui-nt-sub',

  // toolbar
  tbar: 'cgxui-nt-tbar',
  tbarRow: 'cgxui-nt-tbar-row',
  search: 'cgxui-nt-search',
  select: 'cgxui-nt-select',
  seg: 'cgxui-nt-seg',
  segBtn: 'cgxui-nt-segbtn',
  menuBtn: 'cgxui-nt-menubtn',
  menu: 'cgxui-nt-menu',
  menuIt: 'cgxui-nt-menuitem',

  // layout
  list: 'cgxui-nt-list',
  grid: 'cgxui-nt-grid',
  listGrid: 'cgxui-nt-grid',

  // buttons
  btn: 'cgxui-nt-btn',
  btnRow: 'cgxui-nt-btnrow',
  btnPri: 'cgxui-nt-btn-pri',
  btnSec: 'cgxui-nt-btn-sec',

  // composer (new note)
  composeCard: 'cgxui-nt-compose',
  composeRow: 'cgxui-nt-compose-row',
  composeTa: 'cgxui-nt-compose-ta',
  composeMeta: 'cgxui-nt-compose-meta',
  composeHint: 'cgxui-nt-compose-hint',

  // legacy draft (kept for safety)
  draftBox: 'cgxui-nt-draft',
  draftTa: 'cgxui-nt-draft-ta',

  // cards
  card: 'cgxui-nt-card',
  cardPinned: 'cgxui-nt-card-pinned',
  cardBody: 'cgxui-nt-card-body',
  cardTitle: 'cgxui-nt-card-title',
  cardMeta: 'cgxui-nt-card-meta',
  cardText: 'cgxui-nt-card-text',
  actions: 'cgxui-nt-card-actions',
  act: 'cgxui-nt-act',
  actOn: 'cgxui-nt-act-on',

  // inline edit
  editBox: 'cgxui-nt-editbox',
  editTa: 'cgxui-nt-editta',

  // color picker
  pickRow: 'cgxui-nt-pickrow',
  pick: 'cgxui-nt-pick',
  pickOn: 'cgxui-nt-pick-on',

  // sticky section
  stickySec: 'cgxui-nt-stickysec',
  stickyLbl: 'cgxui-nt-stickylabel',
  stickyGrid: 'cgxui-nt-stickygrid',
  stickyCard: 'cgxui-nt-stickycard',
  stickyMeta: 'cgxui-nt-stickymeta',
  stickyText: 'cgxui-nt-stickytext',

  // misc
  hint: 'cgxui-nt-hint',
  empty: 'cgxui-nt-empty',
  err: 'cgxui-nt-err',
  overlay: 'cgxui-nt-overlay',
  divider: 'cgxui-nt-divider',
});


  const ATTR_ = Object.freeze({
  // bind-once
  bound: 'data-nt-bound',
  wrap: 'data-nt-wrap',

  // toolbar
  tb: 'data-nt-tb',
  tbQ: 'data-nt-q',
  tbSort: 'data-nt-sort',
  tbView: 'data-nt-view',
  tbMenuBtn: 'data-nt-menubtn',
  tbMenuBox: 'data-nt-menubox',
  tbAct: 'data-nt-act',
  tbNewColor: 'data-nt-newcolor',

  // scratch + main actions
  scratch: 'data-nt-scratch',
  save: 'data-nt-save',
  clip: 'data-nt-clip',

  // composer (new note card)
  compose: 'data-nt-compose',
  composeTa: 'data-nt-composeta',
  composeSave: 'data-nt-compose-save',
  composeClose: 'data-nt-composeclose',

  // card + actions
  card: 'data-nt-card',
  noteId: 'data-nt-id',
  // legacy alias (some older code paths)
  nid: 'data-nt-id',

  jump: 'data-nt-jump',
  pin: 'data-nt-pin',
  edit: 'data-nt-edit',
  del: 'data-nt-del',
  color: 'data-nt-color',

  // sticky
  sticky: 'data-nt-sticky',
  h2oMsgId: 'data-h2o-msg-id',
  msgId: 'data-msg-id',
  // legacy alias
  msgid: 'data-msg-id',

  // draft composer (A-model legacy; kept for safety)
  newBtn: 'data-nt-new',
  draft: 'data-nt-draft',
  draftTa: 'data-nt-draftta',
  draftSave: 'data-nt-draftsave',
  draftCancel: 'data-nt-draftcancel',

  // inline edit box
  editBox: 'data-nt-editbox',
  editTa: 'data-nt-editta',
  editSave: 'data-nt-editsave',
  editCancel: 'data-nt-editcancel',

  // color picker (swatches)
  pick: 'data-nt-pick',
});


  /* ───────────────────────────── 2) DIAG (bounded) ───────────────────────────── */

  VAULT.diag = VAULT.diag || { ver: '2.4.7', bootCount: 0, lastBootAt: 0, steps: [], stepsMax: 120, lastError: null };

  function DIAG_step(name, extra) {
    try {
      const d = VAULT.diag;
      d.steps.push({ t: Date.now(), name, extra: extra ?? null });
      if (d.steps.length > d.stepsMax) d.steps.shift();
    } catch (_) {}
  }

  /* ───────────────────────────── 3) Helpers ───────────────────────────── */

  function escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getNotesAPI() {
    return W[STR_.apiPrimary] || W[STR_.apiLegacy] || null;
  }

  function lsGet(k) { try { return String(W.localStorage?.getItem(k) || ''); } catch { return ''; } }
  function lsSet(k, v) { try { W.localStorage?.setItem(k, String(v)); } catch (_) {} }
  function safeParse(s, fb) { try { return JSON.parse(s); } catch { return fb; } }

  function loadTbar() {
    const raw = lsGet(KEY_NT_UI_TBAR_STATE);
    const s0 = CFG_.tbarState0;
    if (!raw) return { ...s0 };
    const j = safeParse(raw, null);
    if (!j || typeof j !== 'object') return { ...s0 };

    const next = {
      q: String(j.q ?? s0.q).slice(0, CFG_.qMax),
      view: String(j.view ?? s0.view),
      sort: String(j.sort ?? s0.sort),
      newColor: String(j.newColor ?? s0.newColor),
    };

    // normalize enums
    if (!['all','pinned','clips','sticky'].includes(next.view)) next.view = s0.view;
    if (!['updated_desc','created_desc','title_asc','pinned_first'].includes(next.sort)) next.sort = s0.sort;
    if (!['auto','amber','blue','green','red','purple','pink','gray'].includes(next.newColor)) next.newColor = s0.newColor;

    return next;
  }

  function saveTbar(next) {
    const s0 = CFG_.tbarState0;
    const s = {
      q: String(next?.q ?? s0.q).slice(0, CFG_.qMax),
      view: String(next?.view ?? s0.view),
      sort: String(next?.sort ?? s0.sort),
      newColor: String(next?.newColor ?? s0.newColor),
    };
    lsSet(KEY_NT_UI_TBAR_STATE, JSON.stringify(s));
    return s;
  }

  function splitTitleBody(text) {
    const s = String(text || '').trim();
    if (!s) return { title: '', text: '' };
    const lines = s.split(/\r?\n/);
    const first = String(lines[0] || '').trim();
    const rest  = lines.slice(1).join('\n').trim();
    if (!rest) {
      const title = first.length > 60 ? `${first.slice(0, 60)}…` : first;
      return { title, text: first };
    }
    return { title: first, text: rest };
  }

  function captureSelectionWithSource() {
    const sel = W.getSelection?.();
    const text = String(sel?.toString?.() || '').trim();
    if (!text) return { text: '', msgId: '' };

    const node = sel?.anchorNode || sel?.focusNode || null;
    const el = (node && node.nodeType === 1) ? node : node?.parentElement;
    const msgEl =
      el?.closest?.('[data-h2o-msg-id]') ||
      el?.closest?.('[data-message-id]') ||
      null;

    const msgId = msgEl?.getAttribute?.('data-h2o-msg-id') || msgEl?.getAttribute?.('data-message-id') || '';
    return { text, msgId: String(msgId || '') };
  }

  function scrollToMsgId(msgId) {
    const id = String(msgId || '').trim();
    if (!id) return;

    // Core-first
    try {
      if (W.H2O?.msg?.ensureMountedById?.(id)) {}
    } catch (_) {}

    const esc = (W.CSS && CSS.escape) ? CSS.escape(id) : id;
    const el =
      D.querySelector(`[data-h2o-msg-id="${esc}"]`) ||
      D.querySelector(`[data-message-id="${esc}"]`) ||
      null;

    el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }

  function downloadText(text, filename, mime) {
    try {
      const blob = new Blob([String(text || '')], { type: mime || 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = D.createElement('a');
      a.href = url;
      a.download = filename || `export_${Date.now()}.txt`;
      D.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 800);
    } catch (_) {}
  }

  function getDockBgMode() {
    // prefer Dock API if present
    try {
      const st = W.H2O?.DP?.dckpnl?.api?.getState?.();
      const bg = st?.bg;
      if (bg) return String(bg);
    } catch (_) {}

    const raw = lsGet(KEY_DPANEL_STATE_PANEL_V1);
    const j = safeParse(raw, null);
    const bg = j?.bg;
    return bg ? String(bg) : 'bar';
  }

  function themeVarsForDockMode(mode) {
    // 3 stable themes tied to Dock background selector
    // We set CSS vars used by Notes UI:
    // --nt-bg, --nt-card, --nt-border, --nt-ink, --nt-sub, --nt-focus
    if (mode === 'side') {
      return {
        bg:    'rgba(10,14,20,0.92)',
        card:  'rgba(15,23,42,0.82)',
        border:'rgba(255,255,255,0.10)',
        ink:   'rgba(248,250,252,0.96)',
        sub:   'rgba(255,255,255,0.55)',
        focus:  'rgba(59,130,246,0.35)',
        accent: 'rgba(96,165,250,0.75)',
      };
    }
    if (mode === 'body') {
      return {
        bg:    'rgba(20,20,20,0.92)',
        card:  'rgba(28,28,28,0.92)',
        border:'rgba(255,255,255,0.10)',
        ink:   'rgba(248,250,252,0.96)',
        sub:   'rgba(255,255,255,0.55)',
        focus:  'rgba(59,130,246,0.35)',
        accent: 'rgba(96,165,250,0.75)',
      };
    }
    // bar (default)
    return {
      bg:    'rgba(18,18,18,0.70)',
      card:  'rgba(24,24,24,0.85)',
      border:'rgba(255,255,255,0.10)',
      ink:   'rgba(248,250,252,0.96)',
      sub:   'rgba(255,255,255,0.55)',
      focus:  'rgba(59,130,246,0.35)',
        accent: 'rgba(96,165,250,0.75)',
    };
  }

  function colorTokenToHex(tok) {
    switch (String(tok || 'auto')) {
      case 'amber': return '#f59e0b';
      case 'blue':  return '#60a5fa';
      case 'green': return '#34d399';
      case 'red':   return '#f87171';
      case 'purple':return '#a78bfa';
      case 'pink':  return '#fb7185';
      case 'gray':  return '#94a3b8';
      case 'auto':
      default:      return '';
    }
  }


  function hexToToken(hex) {
    const s = String(hex || '').trim().toLowerCase();
    if (!s) return 'auto';

    // canonical palette (matches colorTokenToHex)
    const map = {
      '#f59e0b': 'amber',
      '#60a5fa': 'blue',
      '#34d399': 'green',
      '#f87171': 'red',
      '#a78bfa': 'purple',
      '#fb7185': 'pink',
      '#94a3b8': 'gray',

      // legacy/alt shades we may encounter in old notes
      '#3b82f6': 'blue',
      '#22c55e': 'green',
      '#ef4444': 'red',
      '#a855f7': 'purple',
      '#ec4899': 'pink',
      '#64748b': 'gray',
      '#9ca3af': 'gray',
    };

    return map[s] || null;
  }

  /** @helper UI memory (ephemeral; never touches disk). */
  function getUiMem(){
    const u = VAULT.state.ui || (VAULT.state.ui = {});
    if (!u.editing) u.editing = {};
    if (!u.editText) u.editText = {};
    if (typeof u.composeOpen !== 'boolean') u.composeOpen = false;
    if (typeof u.composeText !== 'string') u.composeText = '';
    if (typeof u.composeColor !== 'string' || !u.composeColor) u.composeColor = 'auto';
    if (typeof u.focusCompose !== 'boolean') u.focusCompose = false;
    return u;
  }


  function cycleNoteColor(curHexOrToken) {
    // cycles through tokens (compact + no popup)
    const order = ['auto','amber','blue','green','red','purple','pink','gray'];
    const cur = String(curHexOrToken || '').trim();

    // if stored as hex, map back to token if possible
    const mapHexToTok = {
      '#f59e0b':'amber',
      '#60a5fa':'blue',
      '#34d399':'green',
      '#f87171':'red',
      '#a78bfa':'purple',
      '#fb7185':'pink',
      '#94a3b8':'gray',

      // legacy/alt shades
      '#3b82f6':'blue',
      '#22c55e':'green',
      '#ef4444':'red',
      '#a855f7':'purple',
      '#ec4899':'pink',
      '#64748b':'gray',
    };
    const tok = (cur in mapHexToTok) ? mapHexToTok[cur] : (order.includes(cur) ? cur : 'auto');
    const i = order.indexOf(tok);
    const next = order[(i + 1) % order.length];
    return next;
  }

  function applyTbarToNotes(list, ui) {
    const arr = Array.isArray(list) ? list.slice() : [];
    const q = String(ui?.q || '').trim().toLowerCase();

    let out = arr;

    const view = String(ui?.view || 'all');
    if (view === 'pinned') out = out.filter(n => !!n?.pinned);
    if (view === 'clips')  out = out.filter(n => !!(n?.source && n.source.msgId) || (Array.isArray(n?.tags) && n.tags.includes('selection')));

    if (q) {
      out = out.filter(n => {
        const title = String(n?.title || '').toLowerCase();
        const text  = String(n?.text  || '').toLowerCase();
        const tags  = Array.isArray(n?.tags) ? n.tags.join(' ').toLowerCase() : '';
        const src   = String(n?.source?.msgId || '').toLowerCase();
        return title.includes(q) || text.includes(q) || tags.includes(q) || src.includes(q);
      });
    }

    const sort = String(ui?.sort || 'updated_desc');
    const tsU = (n) => Number(n?.updatedAt || n?.createdAt || 0);
    const tsC = (n) => Number(n?.createdAt || 0);

    if (sort === 'updated_desc') out.sort((a,b) => tsU(b) - tsU(a));
    if (sort === 'created_desc') out.sort((a,b) => tsC(b) - tsC(a));
    if (sort === 'title_asc')    out.sort((a,b) => String(a?.title||'').localeCompare(String(b?.title||'')));
    if (sort === 'pinned_first') out.sort((a,b) => (Number(!!b?.pinned) - Number(!!a?.pinned)) || (tsU(b) - tsU(a)));

    return out;
  }

  /* ───────────────────────────── 4) Sticky notes (from Margin Anchor) ───────────────────────────── */

  VAULT.sticky = VAULT.sticky || { installed: false, renderTimer: 0, unsubs: [] };

  function collectStickyNotes() {
    // Prefer Margin Anchor loader if present, but fall back to localStorage parse
    let store = null;

    try {
      const loader = H2O?.MA?.mrgnnchr?.api?.core?.store?.loadV1;
      if (typeof loader === 'function') store = loader();
    } catch (_) {}

    if (!store || typeof store !== 'object') {
      // Fallback: read directly from disk (works even if MA loads later)
      try {
        const raw = W.localStorage?.getItem(KEY_STICKY_STORE) || '';
        if (raw) {
          const j = JSON.parse(raw);
          if (j && typeof j === 'object') store = j;
        }
      } catch (_) {}
    }

    if (!store || typeof store !== 'object') return [];

    const notes = [];
    try {
      for (const [msgId, buckets] of Object.entries(store)) {
        if (!Array.isArray(buckets)) continue;
        for (const bucket of buckets || []) {
          if (!bucket) continue;

          const offRaw = Number(bucket?.a?.off ?? bucket?.off ?? 0);
          const off = Number.isFinite(offRaw) ? offRaw : 0;

          const items = Array.isArray(bucket?.items) ? bucket.items : [];
          for (const item of items) {
            if (!item || item.type !== 'note') continue;

            const id = String(item.id || '');
            const text = String(item.data?.text || '');
            const color = String(item.ui?.color || item.data?.color || '#7c3aed');
            const ts = Number.isFinite(Number(item.ts)) ? Number(item.ts) : Date.now();

            // Skip empty (but keep whitespace-only? no)
            if (!text.trim()) continue;

            notes.push({ id, msgId: String(msgId || ''), off, text, color, ts });
          }
        }
      }
    } catch (_) {
      return [];
    }

    return notes.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }

  function scheduleStickyRerender(delay = 110) {
    const SW = VAULT.sticky;
    if (SW.renderTimer) clearTimeout(SW.renderTimer);
    SW.renderTimer = setTimeout(() => {
      SW.renderTimer = 0;

      // 1) Prefer Dock render request if available
      try { W.H2O?.Dock?.requestRender?.(); } catch (_) {}

      // 2) Direct Notes re-render fallback (covers cases where Dock doesn't expose requestRender)
      try {
        const panelEl = D.querySelector(SEL_.panel);
        const listEl  = panelEl?.querySelector(SEL_.list);
        const view = panelEl?.dataset?.[STR_.viewKey];
        if (panelEl && listEl && view === STR_.tabId) {
          renderNotesTab({ panelEl, listEl });
        }
      } catch (_) {}
    }, delay);
  }


  function watchStickyStore() {
    const SW = VAULT.sticky;
    if (SW.installed) return;
    const onStickyChanged = (e) => {
      const key = String(e?.detail?.key || '');
      if (key && key !== KEY_STICKY_STORE) return;
      scheduleStickyRerender();
    };
    const onDockBgChanged = () => scheduleStickyRerender();

    try {
      W.addEventListener(EV_MANCHOR_STORE_CHANGED_V1, onStickyChanged);
      W.addEventListener(EV_DPANEL_BG_CHANGED_V1, onDockBgChanged);
      SW.unsubs = [
        () => { try { W.removeEventListener(EV_MANCHOR_STORE_CHANGED_V1, onStickyChanged); } catch (_) {} },
        () => { try { W.removeEventListener(EV_DPANEL_BG_CHANGED_V1, onDockBgChanged); } catch (_) {} },
      ];
      SW.installed = true;
    } catch (_) {
      SW.unsubs = [];
      SW.installed = false;
    }
  }

  function unwatchStickyStore() {
    const SW = VAULT.sticky;
    (Array.isArray(SW.unsubs) ? SW.unsubs : []).forEach((fn) => { try { fn(); } catch (_) {} });
    SW.unsubs = [];
    SW.installed = false;
    if (SW.renderTimer) { clearTimeout(SW.renderTimer); SW.renderTimer = 0; }
  }

  /* ───────────────────────────── 5) CSS ───────────────────────────── */

  function CSS_text() {
    return `
/* hide Dock modebar ONLY when Notes is active (view-scoped, no behavior change) */
aside[data-cgxui-view="notes"] div[data-cgxui="modebar"],
aside[data-cgxui-view="notes"] .cgxui-dpnl-modebar,
aside[data-cgxui-view="notes"] .ho-dpnl-modebar,
aside[data-cgxui-view="notes"] .cgxui-modebar{ display:none !important; }

/* theme vars live on wrap */
.${CSS_.wrap}{
  --nt-bg: rgba(18,18,18,0.70);
  --nt-card: rgba(24,24,24,0.85);
  --nt-border: rgba(255,255,255,0.10);
  --nt-ink: rgba(248,250,252,0.96);
  --nt-sub: rgba(255,255,255,0.55);
  --nt-focus: rgba(59,130,246,0.35);
  --nt-accent: rgba(96,165,250,0.75);
  color: var(--nt-ink);
}


.${CSS_.sec}{
  display:flex;
  flex-direction:column;
  gap:10px;
  padding:12px;
  border-radius:16px;
  border:1px solid var(--nt-border);
  background: var(--nt-bg);
  box-shadow: 0 14px 40px rgba(0,0,0,0.55);
}

.${CSS_.hdr}{
  display:flex;
  flex-wrap:wrap;
  align-items:flex-end;
  justify-content:space-between;
  gap:6px;
  margin-top:2px;
}
.${CSS_.title}{
  font-size:12px;
  letter-spacing:.35px;
  text-transform:uppercase;
  color: var(--nt-sub);
}
.${CSS_.sub}{
  font-size:11px;
  color: color-mix(in oklab, var(--nt-sub) 88%, transparent);
}

/* toolbar */
.${CSS_.tbar}{
  display:flex;
  flex-direction:column;
  gap:8px;
  padding:2px 0 6px;
}
.${CSS_.trow}{
  display:flex;
  gap:8px;
  align-items:center;
  flex-wrap:wrap;
}
.${CSS_.search}{
  flex:1 1 180px;
  min-width:180px;
  height:32px;
  border-radius:12px;
  border:1px solid var(--nt-border);
  background: color-mix(in oklab, var(--nt-card) 80%, transparent);
  color: var(--nt-ink);
  padding:0 10px;
  font: 12.5px/1.2 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
  outline:none;
}
.${CSS_.search}:focus{
  box-shadow: 0 0 0 2px var(--nt-focus);
}
.${CSS_.select}{
  height:32px;
  border-radius:12px;
  border:1px solid var(--nt-border);
  background: color-mix(in oklab, var(--nt-card) 80%, transparent);
  color: var(--nt-ink);
  padding:0 10px;
  font: 11px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
  outline:none;
}
.${CSS_.seg}{
  display:flex;
  height:32px;
  border-radius:999px;
  border:1px solid var(--nt-border);
  background: rgba(255,255,255,0.04);
  overflow:hidden;
  flex: 1 1 auto;
  min-width: 180px;
}
.${CSS_.segBtn}{
  height: 28px;
  border:none;
  background:transparent;
  color: rgba(255,255,255,0.85);
  padding:0 10px;
  font: 11px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
  cursor:pointer;
}
.${CSS_.segBtn}[aria-pressed="true"]{
  background: rgba(59,130,246,0.20);
  color: var(--nt-ink);
}
.${CSS_.menuBtn}{
  height:32px;
  width:38px;
  border-radius:999px;
  border:1px solid var(--nt-border);
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.90);
  cursor:pointer;
  font: 13px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
}
.${CSS_.menu}{
  display:none;
  position:fixed;
  left:0;
  top:0;
  min-width:170px;
  border-radius:12px;
  border:1px solid var(--nt-border);
  background: rgba(10,14,20,0.96);
  box-shadow: 0 14px 40px rgba(0,0,0,0.70);
  padding:6px;
  z-index: 60;
}
.${CSS_.menu}[aria-hidden="false"]{ display:block; }
.${CSS_.menuIt}{
  width:100%;
  text-align:left;
  border:none;
  background:transparent;
  color: rgba(255,255,255,0.92);
  padding:9px 10px;
  border-radius:10px;
  cursor:pointer;
  font: 12px/1.2 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
}
.${CSS_.menuIt}:hover{ background: rgba(59,130,246,0.18); }

/* scratch */
.${CSS_.ta}{
  width:100%;
  min-height:86px;
  resize:vertical;
  border-radius:14px;
  border:1px solid var(--nt-border);
  background: color-mix(in oklab, var(--nt-card) 85%, transparent);
  color: var(--nt-ink);
  padding:10px 12px;
  font: 13px/1.35 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
  outline:none;
}
.${CSS_.ta}:focus{ box-shadow: 0 0 0 2px var(--nt-focus); }

/* buttons: smaller + dock-friendly */
.${CSS_.btnRow}{
  display:flex;
  gap:8px;
  flex-wrap:wrap;
  align-items:center;
}
.${CSS_.btn}{
  height: 28px;
  border-radius:999px;
  padding: 0 10px;
  font-size:11.5px;
  letter-spacing:.35px;
  text-transform:uppercase;
  border:1px solid var(--nt-border);
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.92);
  cursor:pointer;
  transition: transform .12s ease, background .12s ease, border-color .12s ease;
}
.${CSS_.btn}:hover{
  background: rgba(59,130,246,0.16);
  border-color: rgba(59,130,246,0.55);
  transform: translateY(-1px);
}
.${CSS_.btnPri}{
  background: rgba(59,130,246,0.22);
  border-color: rgba(59,130,246,0.55);
}
.${CSS_.btnSec}{
  background: rgba(255,255,255,0.03);
}

/* cards */
.${CSS_.listGrid}{
  display:grid;
  grid-template-columns: 1fr;
  gap:10px;
  margin-top:2px;
}
.${CSS_.card}{
  border:none;
  border-radius:14px;
  background: var(--nt-card);
  box-shadow: 0 8px 22px rgba(0,0,0,0.45);
  padding:10px 12px;
  text-align:left;
  cursor:pointer;
  transition: transform .12s ease, box-shadow .12s ease;
  position:relative;
  overflow:hidden;
  flex: 1 1 auto;
  min-width: 180px;
}
.${CSS_.card}:hover{
  transform: translateY(-1px);
  box-shadow: 0 12px 28px rgba(0,0,0,0.55);
}
.${CSS_.card}::before{
  content:"";
  position:absolute;
  left:0; top:0; bottom:0;
  width:4px;
  background: var(--nt-note-edge, var(--nt-accent, rgba(148,163,184,0.55)));
  opacity: 0.95;
}
.${CSS_.cardTitle}{
  font-size:13px;
  font-weight:600;
  color: rgba(255,255,255,0.95);
  margin-bottom:4px;
}
.${CSS_.cardText}{
  font-size:12.5px;
  line-height:1.35;
  color: rgba(255,255,255,0.80);
  white-space:pre-wrap;
  overflow-wrap:break-word;
}
.${CSS_.cardMeta}{
  margin-top:8px;
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:10px;
  font-size:11px;
  color: var(--nt-sub);
}
.${CSS_.actions}{
  display:flex;
  gap:6px;
  align-items:center;
}
.${CSS_.act}{
  width:26px;
  height:26px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.03);
  color: rgba(255,255,255,0.92);
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  font: 11px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
}
.${CSS_.act}:hover{ background: rgba(255,255,255,0.06); }
.${CSS_.empty}{
  padding:10px 12px;
  border-radius:12px;
  border:1px dashed rgba(255,255,255,0.20);
  background: rgba(255,255,255,0.03);
  color: rgba(255,255,255,0.70);
  font-size:12.5px;
}

/* sticky */
.${CSS_.stickySec}{
  margin-top:12px;
  display:flex;
  flex-direction:column;
  gap:8px;
}
.${CSS_.stickyLbl}{
  font-size:12px;
  letter-spacing:.35px;
  text-transform:uppercase;
  color: var(--nt-sub);
}
.${CSS_.stickyGrid}{
  display:grid;
  grid-template-columns: 1fr;
  gap:10px;
}
.${CSS_.stickyCard}{
  border:none;
  border-radius:14px;
  padding:12px;
  text-align:left;
  display:flex;
  flex-direction:column;
  gap:8px;
  box-shadow: 0 10px 26px rgba(0,0,0,.45);
  cursor:pointer;
  transition: transform .12s ease, box-shadow .12s ease;
}
.${CSS_.stickyCard}:hover{
  transform: translateY(-1px);
  box-shadow: 0 14px 32px rgba(0,0,0,.60);
}
.${CSS_.stickyMeta}{
  display:flex;
  justify-content:space-between;
  font-size:11px;
  opacity:.92;
  gap:12px;
}
.${CSS_.stickyText}{
  font-size:12.5px;
  line-height:1.35;
  white-space:pre-wrap;
  overflow-wrap:break-word;
}


/* --- Draft/Edit: hide when closed (prevents whitespace) --- */
.${CSS_.draftBox}[aria-hidden="true"],
.${CSS_.editBox}[aria-hidden="true"]{ display:none; }

/* Dark textarea styling (prevents default white boxes) */
.${CSS_.draftTa},
.${CSS_.editTa},
.${CSS_.composeTa}{
  width:100%;
  min-height:92px;
  resize:vertical;
  border-radius:12px;
  border:1px solid rgba(255,255,255,0.14);
  background: rgba(15,23,42,0.80) !important;
  color:#f8fafc !important;
  padding:10px 12px;
  outline:none;
  font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
}
.${CSS_.draftTa}:focus,
.${CSS_.editTa}:focus,
.${CSS_.composeTa}:focus{
  border-color: rgba(59,130,246,0.85);
  box-shadow: 0 0 0 2px rgba(59,130,246,0.22);
}

/* Toolbar should wrap cleanly inside panel */
.${CSS_.trow}{ flex-wrap:wrap; }
.${CSS_.seg}{ overflow:auto; white-space:nowrap; }
.${CSS_.menuBtn}{ flex:0 0 auto; }

/* Menu should not clip inside panel */
.${CSS_.menu}{
  position: fixed;
  z-index: 2147483000;
}
.${CSS_.menu}[aria-hidden="false"]{ display:block; }

/* In-card edit area should feel native */
.${CSS_.editBox}{
  margin-top:10px;
  padding:10px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,0.10);
  background: rgba(15,23,42,0.45);
}

/* Composer card */
.${CSS_.composeCard}{
  border:1px solid rgba(255,255,255,0.10);
  border-radius:18px;
  padding:12px;
  background: rgba(15,23,42,0.35);
}
.${CSS_.composeMeta}{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  margin-bottom:8px;
  font-size:11px;
  color: rgba(255,255,255,0.70);
  text-transform:uppercase;
  letter-spacing:.35px;
}
.${CSS_.composeHint}{
  font-size:11px;
  color: rgba(255,255,255,0.50);
  margin-top:6px;
}

.${CSS_.composeRow}{
  display:flex;
  gap:8px;
  align-items:center;
  justify-content:flex-start;
}

.${CSS_.swRow}{
  display:flex;
  gap:6px;
  align-items:center;
  flex-wrap:wrap;
  margin: 6px 0 0;
}

.${CSS_.sw}{
  width: 20px;
  height: 20px;
  min-width:20px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.16);
  background: rgba(255,255,255,0.06);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.22);
  cursor:pointer;
  padding:0;
  font-size:10px;
  line-height:20px;
  color: rgba(255,255,255,0.80);
}
.${CSS_.sw}[aria-pressed="true"]{
  border-color: rgba(255,255,255,0.35);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.25), 0 0 0 2px rgba(255,255,255,0.06);
}
.${CSS_.sw}::before{
  content:'';
  display:block;
  width:100%;
  height:100%;
  border-radius:999px;
  background: var(--sw, rgba(255,255,255,0.06));
  opacity: 0.9;
}
.${CSS_.sw}[${ATTR_.pick}="auto"]{
  width:auto;
  padding:0 10px;
  font-size:11px;
}
.${CSS_.sw}[${ATTR_.pick}="auto"]::before{
  display:none;
}


/* Notes list wrappers (missing tokens) */
.${CSS_.list}{ display:block; }
.${CSS_.grid}{ display:grid; grid-template-columns: 1fr; gap: 10px; }
.${CSS_.cardBody}{ display:flex; flex-direction:column; gap:8px; }
.${CSS_.hint}{ font-size:11px; color: rgba(255,255,255,0.55); }
.${CSS_.composeRow}{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
`;
  }

  function ensureStyle() {
    let style = D.getElementById(CSS_STYLE_ID);
    if (!style) {
      style = D.createElement('style');
      style.id = CSS_STYLE_ID;
      (D.head || D.documentElement).appendChild(style);
    }
    const css = CSS_text();
    if (style.textContent !== css) style.textContent = css;
  }

  /* ───────────────────────────── 6) Notes-only bindings (tab-scoped) ───────────────────────────── */

  function bindNotesHandlersOnce(ctx, api) {
  const listEl = ctx?.listEl || null;
  const panelEl = ctx?.panelEl || null;
  if (!listEl || !api) return;

  // Bind once per list container
  if (listEl.getAttribute(ATTR_.bound) === '1') return;
  listEl.setAttribute(ATTR_.bound, '1');

  const uiMem = getUiMem();

  // NOTE: Notes uses document-capture delegation and often stops propagation so
  // Dock's global row-capture can't swallow our clicks. This can prevent Dock
  // from re-rendering Notes immediately. So we request Dock render *and* force a
  // tab-scoped Notes re-render as a fallback.
  const requestRender = () => {
    // 1) Ask Dock (if available)
    try { W.H2O?.Dock?.requestRender?.(); } catch (_) {}

    // 2) Force Notes-only render (active Notes view) — debounced
    try {
      if (uiMem._ntRenderRaf) return;
      uiMem._ntRenderRaf = W.requestAnimationFrame(() => {
        uiMem._ntRenderRaf = 0;

        // Prefer the ctx elements (instant UI updates without tab switching)
        let p = (panelEl && panelEl.isConnected) ? panelEl : D.querySelector(SEL_.panel);
        let l = (listEl && listEl.isConnected) ? listEl : (p?.querySelector?.(SEL_.list) || null);
        if (!p || !l) return;

        // Respect Dock active view if it exposes it
        const dockView = String(p.getAttribute('data-cgxui-view') || '').trim();
        const v = String(p?.dataset?.[STR_.viewKey] || '').trim();
        const cur = dockView || v || '';
        if (cur && cur !== STR_.tabId) return; // only when Notes is active

        try { renderNotesTab({ panelEl: p, listEl: l }); } catch (_) {}
      });
    } catch (_) {}
  };

  const closeAllMenus = () => {
    try {
      listEl.querySelectorAll(`div.${CSS_.menu}[aria-hidden="false"]`).forEach(m => m.setAttribute('aria-hidden', 'true'));
    } catch (_) {}
  };

  const positionMenuFixed = (btn, menu) => {
    if (!btn || !menu) return;
    try {
      const r = btn.getBoundingClientRect();
      // preferred: open down-right, but clamp to viewport
      const pad = 8;
      const vw = Math.max(320, W.innerWidth || 0);
      const vh = Math.max(240, W.innerHeight || 0);

      // temporarily show to measure
      menu.style.position = 'fixed';
      menu.style.left = '0px';
      menu.style.top = '0px';
      menu.style.right = 'auto';
      menu.style.bottom = 'auto';
      menu.style.zIndex = '999999';
      menu.style.display = 'block';
      const mr = menu.getBoundingClientRect();
      menu.style.display = ''; // let CSS handle display via aria-hidden

      let left = r.right - mr.width;
      let top = r.bottom + 6;

      // if too far left, open from left edge of button
      if (left < pad) left = Math.min(r.left, vw - mr.width - pad);
      // clamp right
      if (left + mr.width > vw - pad) left = vw - mr.width - pad;

      // if off bottom, open upward
      if (top + mr.height > vh - pad) top = Math.max(pad, r.top - mr.height - 6);

      menu.style.left = `${Math.max(pad, left)}px`;
      menu.style.top = `${Math.max(pad, top)}px`;
    } catch (_) {}
  };

  const setSwatchPressed = (boxEl, tok) => {
    try {
      const row = boxEl?.querySelector?.(`.${CSS_.swRow}`) || null;
      if (!row) return;
      row.querySelectorAll(`button[${ATTR_.pick}]`).forEach(b => {
        const v = String(b.getAttribute(ATTR_.pick) || '');
        b.setAttribute('aria-pressed', v === tok ? 'true' : 'false');
      });
    } catch (_) {}
  };

  const getBoxColorTok = (boxEl) => String(boxEl?.dataset?.ntColorTok || 'auto');

  const setBoxColorTok = (boxEl, tok) => {
    if (!boxEl) return;
    boxEl.dataset.ntColorTok = String(tok || 'auto');
    setSwatchPressed(boxEl, boxEl.dataset.ntColorTok);
  };


  const openCompose = () => {
    const ui = getUiMem();
    ui.composeOpen = true;
    ui.composeText = '';
    ui.composeColor = String(loadTbar()?.newColor || ui.composeColor || 'auto');
    ui.focusCompose = true;
    requestRender();
  };

  const closeCompose = () => {
    const ui = getUiMem();
    ui.composeOpen = false;
    ui.composeText = '';
    ui.focusCompose = false;
    requestRender();
  };

  const saveCompose = (textOverride = null) => {
    const ui = getUiMem();
    const raw = String(textOverride ?? ui.composeText ?? '').trim();
    const { title, text } = splitTitleBody(raw);
    if (!title && !text) return;

    api.add?.({
      title,
      text,
      type: 'note',
      color: (colorTokenToHex(String(ui.composeColor || 'auto')) || ''),
    });

    ui.composeText = '';
    ui.composeOpen = false;
    ui.focusCompose = false;
    requestRender();
  };
const closeEditBox = (cardEl) => {
    const eb = cardEl?.querySelector?.(`div[${ATTR_.editBox}="1"]`) || null;
    if (!eb) return;
    eb.setAttribute('aria-hidden', 'true');
    try { eb.querySelector(`textarea[${ATTR_.editTa}="1"]`)?.blur?.(); } catch (_) {}
  };

  const openEditBox = (cardEl, noteId) => {
    const eb = cardEl?.querySelector?.(`div[${ATTR_.editBox}="1"]`) || null;
    const ta = eb?.querySelector?.(`textarea[${ATTR_.editTa}="1"]`) || null;
    if (!eb || !ta) return;

    const cur = (api.list?.() || []).find(n => n && n.id === noteId) || null;
    ta.value = String(cur?.text || '');
    eb.setAttribute('aria-hidden', 'false');

    // initialize swatches from note color if possible (best-effort)
    setBoxColorTok(eb, 'auto');
    ta.focus();
  };

  // --- click delegation (document capture, tab-scoped) ---
  const onDocClick = (e) => {
    const t = e.target;

    // Only handle clicks inside Notes tab UI
    const wrap = t?.closest?.(`div.${CSS_.wrap}[${ATTR_.wrap}="1"]`);
    if (!wrap) return;

    // Prevent Dock/other tabs from swallowing Notes controls
    try { e.stopImmediatePropagation(); } catch (_) {}

    // Menu button (three dots) - also handle reposition
    const menuBtn = t?.closest?.(`button[${ATTR_.tbMenuBtn}="1"]`);
    if (menuBtn) {
      e.preventDefault();
      const menu = menuBtn.parentElement?.querySelector?.(`div.${CSS_.menu}`) || null;
      if (!menu) return;

      const isOpen = menu.getAttribute('aria-hidden') === 'false';
      closeAllMenus();

      if (!isOpen) {
        menu.setAttribute('aria-hidden', 'false');
        positionMenuFixed(menuBtn, menu);
      } else {
        menu.setAttribute('aria-hidden', 'true');
      }
      return;
    }

    // Click outside menu closes it
    const openMenu = wrap.querySelector?.(`div.${CSS_.menu}[aria-hidden="false"]`) || null;
    if (openMenu && !t.closest?.(`div.${CSS_.menu}`)) {
      openMenu.setAttribute('aria-hidden', 'true');
    }

    // Toolbar segmented buttons (view)
    const segBtn = t?.closest?.(`button.${CSS_.segBtn}[data-v]`);
    if (segBtn && segBtn.closest?.(`div[${ATTR_.tbView}="1"]`)) {
      e.preventDefault();
      const v = String(segBtn.getAttribute('data-v') || 'all');
      const ui = loadTbar();
      saveTbar({ ...ui, view: v });
      requestRender();
      return;
    }

    // Toolbar menu actions
    const actBtn = t?.closest?.(`button.${CSS_.menuIt}[${ATTR_.tbAct}]`);
    if (actBtn) {
      e.preventDefault();
      const act = String(actBtn.getAttribute(ATTR_.tbAct) || '');

      if (act === 'export') {
        const json = api.exportJSON?.();
        if (json) downloadText(json, `notes_${api.chatId?.() || 'chat'}_${Date.now()}.json`, 'application/json');
        return;
      }

      if (act === 'clearDraft') {
        try { api.scratchSet?.(''); } catch (_) {}
        closeCompose();
        return;
      }

      if (act === 'clearAll') {
        const ok = confirm('Clear ALL side notes for this chat?');
        if (!ok) return;
        api.clear?.();
        try { api.scratchSet?.(''); } catch (_) {}
        closeCompose();
        requestRender();
        return;
      }
    }

    // Compose buttons
    const btnNew = t?.closest?.(`button[${ATTR_.newBtn}="1"]`);
    const btnClip = t?.closest?.(`button[${ATTR_.clip}="1"]`);
    if (btnNew || btnClip) {
      e.preventDefault();

      if (btnNew) {
        openCompose();
        return;
      }

      if (btnClip) {
        const { text: selText, msgId } = captureSelectionWithSource();
        if (!selText) return;
        const { title, text } = splitTitleBody(selText);

        api.add?.({
          title: title || 'Selection',
          text,
          type: 'note',
          source: msgId ? { msgId } : null,
          tags: ['selection'],
        });
        requestRender();
        return;
      }
    }


    // Composer save
    const compSave = t?.closest?.(`button[${ATTR_.composeSave}="1"]`);
    if (compSave) {
      e.preventDefault();
      e.stopPropagation();
      const ta = wrap.querySelector?.(`textarea[${ATTR_.composeTa}="1"]`) || null;
      saveCompose(String(ta?.value || ''));
      return;
    }

    // Composer close
    const compClose = t?.closest?.(`button[${ATTR_.composeClose}="1"]`);
    if (compClose) {
      e.preventDefault();
      e.stopPropagation();
      closeCompose();
      return;
    }

    // Color swatches (composer + edit)
    const pickBtn = t?.closest?.(`button[${ATTR_.pick}]`);
    if (pickBtn) {
      e.preventDefault();
      e.stopPropagation();
      const tok = String(pickBtn.getAttribute(ATTR_.pick) || 'auto');

      const compBox = pickBtn.closest?.(`div[${ATTR_.compose}="1"]`);
      if (compBox) {
        getUiMem().composeColor = tok;
        requestRender();
        return;
      }

      const editBox = pickBtn.closest?.(`div[${ATTR_.editBox}="1"]`);
      if (editBox) {
        setBoxColorTok(editBox, tok);
        return;
      }
    }

    // Card action buttons
    const actJump = t?.closest?.(`button[${ATTR_.jump}="1"]`);
    const actPin  = t?.closest?.(`button[${ATTR_.pin}="1"]`);
    const actEdit = t?.closest?.(`button[${ATTR_.edit}="1"]`);
    const actDel  = t?.closest?.(`button[${ATTR_.del}="1"]`);
    const actColor= t?.closest?.(`button[${ATTR_.color}="1"]`);

    const editSave = t?.closest?.(`button[${ATTR_.editSave}="1"]`);
    const editCancel = t?.closest?.(`button[${ATTR_.editCancel}="1"]`);

    if (actJump || actPin || actEdit || actDel || actColor || editSave || editCancel) {
      e.preventDefault();

      const card = t.closest?.(`[${ATTR_.card}="1"]`);
      const noteId = card?.getAttribute?.(ATTR_.noteId) || '';

      if (actJump) {
        const msgId = actJump.getAttribute(ATTR_.msgId) || '';
        if (msgId) scrollToMsgId(msgId);
        return;
      }

      if (actPin && noteId) {
        api.togglePin?.(noteId);
        requestRender();
        return;
      }

      if (actColor && noteId) {
        // Cycle note color (auto → amber → blue → green → red → purple → pink → gray → auto)
        const cur = (api.list?.() || []).find(it => it && String(it.id) === String(noteId)) || null;
        const curRaw = String(cur?.color || '').trim();
        const curTok = hexToToken(curRaw) || (curRaw || 'auto');
        const nextTok = cycleNoteColor(curTok);
        const nextHex = colorTokenToHex(nextTok) || '';

        if (api.update) api.update(noteId, { color: nextHex });
        else api.toggleColor?.(noteId);

        requestRender();
        return;
      }

      if (actDel && noteId) {
        const ok = confirm('Delete this note?');
        if (!ok) return;
        api.remove?.(noteId);
        requestRender();
        return;
      }

      if (actEdit && noteId) {
        const wasEditing = !!uiMem.editing[noteId];

        if (!wasEditing) {
          const cur = (api.list?.() || []).find(it => it && String(it.id) === String(noteId)) || null;
          uiMem.editText[noteId] = String(cur?.text || '');
          uiMem.editing[noteId] = true;
          requestRender();
          return;
        }

        // Save & close (✓)
        const next = String(uiMem.editText[noteId] ?? '');
        api.update?.(noteId, { text: next });
        uiMem.editing[noteId] = false;
        requestRender();
        return;
      }

      // legacy buttons (kept for compatibility; may not exist in current UI)
      if (editCancel) {
        const card = t.closest?.(`[${ATTR_.card}="1"]`);
        const noteId = card?.getAttribute?.(ATTR_.nid) || '';
        if (noteId) uiMem.editing[noteId] = false;
        requestRender();
        return;
      }

      if (editSave && noteId) {
        api.update?.(noteId, { text: String(uiMem.editText[noteId] ?? '') });
        uiMem.editing[noteId] = false;
        requestRender();
        return;
      }
    }
  };

  // --- input handlers (search + composer) ---
  const onKeyDown = (e) => {
    const t = e.target;

    // Composer: Enter saves (Shift+Enter = newline), Esc closes
    if (t && t.getAttribute?.(ATTR_.composeTa) === '1') {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeCompose();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        saveCompose(String(t.value || ''));
        return;
      }
      return;
    }

    // Edit: Enter saves (Shift+Enter = newline), Esc cancels
    if (t && t.getAttribute?.(ATTR_.editTa) === '1') {
      const noteId = String(t.getAttribute('data-nid') || '').trim();

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (noteId) uiMem.editing[noteId] = false;
        requestRender();
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        const next = String(t.value || '');
        if (noteId) {
          api.update?.(noteId, { text: next });
          uiMem.editing[noteId] = false;
        }
        requestRender();
        return;
      }
      return;
    }
  };

  const onInput = (e) => {
    const el = e.target;

    // Search query (toolbar)
    if (el && el.getAttribute?.(ATTR_.tbQ) === '1') {
      const ui = loadTbar();
      saveTbar({ ...ui, q: String(el.value || '') });
      requestRender();
      return;
    }

    // Composer live state
    if (el && el.getAttribute?.(ATTR_.composeTa) === '1') {
      getUiMem().composeText = String(el.value || '');
      return;
    }

    // Inline edit live state
    if (el && el.getAttribute?.(ATTR_.editTa) === '1') {
      const uiMem = getUiMem();
      const noteId = String(el.getAttribute('data-nid') || '').trim();
      if (noteId) uiMem.editText[noteId] = String(el.value || '');
      return;
    }
  };

  const onChange = (e) => {
    const el = e.target;
    if (!el) return;

    // Sort selector
    if (el.getAttribute?.(ATTR_.tbSort) === '1') {
      const ui = loadTbar();
      saveTbar({ ...ui, sort: String(el.value || 'updated_desc') });
      requestRender();
      return;
    }

    // New note default color selector
    if (el.getAttribute?.(ATTR_.tbNewColor) === '1') {
      const ui = loadTbar();
      saveTbar({ ...ui, newColor: String(el.value || 'auto') });
      return;
    }
  };

  // Bind (document capture to beat Dock click capture)
  D.addEventListener('click', onDocClick, true);
  listEl.addEventListener('input', onInput, true);
  listEl.addEventListener('change', onChange, true);
  listEl.addEventListener('keydown', onKeyDown, true);

  // init: keep draft hidden; ensure swatches default state
  try {
    const box = listEl.querySelector(`div[${ATTR_.draft}="1"]`);
    if (box) setBoxColorTok(box, 'auto');
  } catch (_) {}

  // cleanup handles
  VAULT.state._unbind = VAULT.state._unbind || [];
  VAULT.state._unbind.push(() => {
    try { D.removeEventListener('click', onDocClick, true); } catch (_) {}
    try { listEl.removeEventListener('input', onInput, true); } catch (_) {}
    try { listEl.removeEventListener('change', onChange, true); } catch (_) {}
    try { listEl.removeEventListener('keydown', onKeyDown, true); } catch (_) {}
    try { listEl.removeAttribute(ATTR_.bound); } catch (_) {}
  });
}

  /* ───────────────────────────── 7) Renderer ───────────────────────────── */

  function renderNotesTab(ctx) {
    const panelEl = ctx?.panelEl || null;
    const listEl  = ctx?.listEl  || null;
    if (!listEl) return;

    ensureStyle();

    const api = getNotesAPI();
    if (!api) {
      listEl.innerHTML = `<div class="${CSS_.empty}">${STR_.emptyNoApi}</div>`;
      if (panelEl) panelEl.dataset[STR_.viewKey] = STR_.tabId;
      return;
    }

    const dockMode = getDockBgMode();
    const vars = themeVarsForDockMode(dockMode);

    const ui = loadTbar();
    const uiMem = getUiMem();

    const scratchRaw = api.scratchGet?.() || '';
    const notesAll = api.list?.() || [];
    const stickyAll = collectStickyNotes();

    // view === sticky is UI behavior: show only sticky section (read-only)
    const showStickyOnly = (ui.view === 'sticky');

    const notes = showStickyOnly ? [] : applyTbarToNotes(notesAll, ui);
    const stickyNotes = (ui.view === 'sticky') ? stickyAll : stickyAll;

    const tbarHtml = `
      <div class="${CSS_.tbar}" ${ATTR_.tb}="1">
        <div class="${CSS_.trow}">
          <input class="${CSS_.search}" ${ATTR_.tbQ}="1" type="text"
            value="${escHtml(ui.q)}"
            placeholder="${escHtml(STR_TBAR_.searchPh)}"/>
        </div>

        <div class="${CSS_.trow}">
          <select class="${CSS_.select}" ${ATTR_.tbSort}="1" aria-label="${escHtml(STR_TBAR_.sortLbl)}">
            <option value="updated_desc" ${ui.sort==='updated_desc'?'selected':''}>Updated</option>
            <option value="created_desc" ${ui.sort==='created_desc'?'selected':''}>Created</option>
            <option value="title_asc" ${ui.sort==='title_asc'?'selected':''}>Title</option>
            <option value="pinned_first" ${ui.sort==='pinned_first'?'selected':''}>Pinned first</option>
          </select>

          <select class="${CSS_.select}" ${ATTR_.tbNewColor}="1" aria-label="${escHtml(STR_TBAR_.colorLbl)}" title="${escHtml(STR_TBAR_.colorLbl)}">
            <option value="auto"  ${ui.newColor==='auto'?'selected':''}>Auto</option>
            <option value="amber" ${ui.newColor==='amber'?'selected':''}>Amber</option>
            <option value="blue"  ${ui.newColor==='blue'?'selected':''}>Blue</option>
            <option value="green" ${ui.newColor==='green'?'selected':''}>Green</option>
            <option value="red"   ${ui.newColor==='red'?'selected':''}>Red</option>
            <option value="purple"${ui.newColor==='purple'?'selected':''}>Purple</option>
            <option value="pink"  ${ui.newColor==='pink'?'selected':''}>Pink</option>
            <option value="gray"  ${ui.newColor==='gray'?'selected':''}>Gray</option>
          </select>

          <div class="${CSS_.seg}" ${ATTR_.tbView}="1">
            <button type="button" class="${CSS_.segBtn}" data-v="all"    aria-pressed="${ui.view==='all'}">${escHtml(STR_TBAR_.viewAll)}</button>
            <button type="button" class="${CSS_.segBtn}" data-v="pinned" aria-pressed="${ui.view==='pinned'}">${escHtml(STR_TBAR_.viewPinned)}</button>
            <button type="button" class="${CSS_.segBtn}" data-v="clips"  aria-pressed="${ui.view==='clips'}">${escHtml(STR_TBAR_.viewClips)}</button>
            <button type="button" class="${CSS_.segBtn}" data-v="sticky" aria-pressed="${ui.view==='sticky'}">${escHtml(STR_TBAR_.viewSticky)}</button>
          </div>

          <span style="position:relative;">
            <button type="button" class="${CSS_.menuBtn}" ${ATTR_.tbMenuBtn}="1" aria-expanded="false">${escHtml(STR_TBAR_.menu)}</button>
            <div class="${CSS_.menu}" ${ATTR_.tbMenuBox}="1" aria-hidden="true">
              <button type="button" class="${CSS_.menuIt}" ${ATTR_.tbAct}="export">${escHtml(STR_TBAR_.actExport)}</button>
              <button type="button" class="${CSS_.menuIt}" ${ATTR_.tbAct}="clearDraft">${escHtml(STR_TBAR_.actClearDraft)}</button>
              <button type="button" class="${CSS_.menuIt}" ${ATTR_.tbAct}="clearAll">${escHtml(STR_TBAR_.actClearAll)}</button>
            </div>
          </span>
        </div>
      </div>
    `;

    const cardsHtml = notes.length ? notes.map(n => {
      const id = String(n?.id || '');
      const title = escHtml(n?.title || '(untitled)');
      const text  = escHtml(n?.text || '');
      const pinned = !!n?.pinned;

      const hasSrc = !!(n?.source && n.source.msgId);
      const srcMsg = hasSrc ? escHtml(String(n.source.msgId || '')) : '';

      const ts = Number(n?.updatedAt || n?.createdAt || 0) || 0;
      const updated = new Date(ts || Date.now());
      const metaLabel = `${pinned ? 'Pinned' : 'Note'} · ${updated.toLocaleString()}`;

      const rawColor = String(n?.color || '').trim();
      const token = hexToToken(rawColor) || (rawColor && rawColor !== 'auto' ? rawColor : 'auto');
      const cssHex = colorTokenToHex(token);
      const edge = cssHex ? cssHex : 'var(--nt-accent, rgba(148,163,184,0.55))';

      const isEditing = !!uiMem.editing[id];
      const editText = isEditing ? String(uiMem.editText[id] ?? (n?.text || '')) : '';

      // IMPORTANT: do not use <button> as the card root because it contains
      // action buttons inside (nested buttons are invalid HTML and cause
      // broken layout + unclickable controls in some browsers).
      return `
      <div class="${CSS_.card}" ${ATTR_.card}="1" ${ATTR_.nid}="${escHtml(id)}" role="group"
        style="--nt-note-edge:${edge};">
        <div class="${CSS_.cardBody}">
          <div><b>${title}</b>${text ? ` — ${text}` : ''}</div>
        </div>

        <div class="${CSS_.cardMeta}">
          <span>${metaLabel}</span>

          <span class="${CSS_.actions}">
            ${hasSrc ? `<button type="button" class="${CSS_.act}" ${ATTR_.jump}="1" ${ATTR_.msgid}="${srcMsg}" title="Jump">↪</button>` : ''}
            <button type="button" class="${CSS_.act}" ${ATTR_.pin}="1" title="Pin">${pinned ? '★' : '☆'}</button>
            <button type="button" class="${CSS_.act}" ${ATTR_.color}="1" title="Color">◐</button>
            <button type="button" class="${CSS_.act}" ${ATTR_.edit}="1" title="Edit">${isEditing ? '✓' : '✎'}</button>
            <button type="button" class="${CSS_.act}" ${ATTR_.del}="1" title="Delete">⌫</button>
          </span>
        </div>

        <div class="${CSS_.editBox}" ${ATTR_.editBox}="1" style="display:${isEditing ? 'block' : 'none'};">
          <textarea class="${CSS_.ta}" ${ATTR_.editTa}="1" placeholder="Edit…" data-nid="${escHtml(id)}">${escHtml(editText)}</textarea>
          <div class="${CSS_.swRow}">
            ${['auto','amber','blue','green','red','purple','pink','gray'].map(tok => {
              const hex = colorTokenToHex(tok) || 'transparent';
              const on = (tok === (hexToToken(rawColor) || (rawColor || 'auto')));
              return `<button type="button" class="${CSS_.sw}" ${ATTR_.pick}="${tok}" aria-pressed="${on}"
                        data-nid="${escHtml(id)}" style="--sw:${hex};"></button>`;
            }).join('')}
          </div>
          <div class="${CSS_.hint}">Enter to save · Shift+Enter for new line</div>
        </div>
      </div>`;
    }).join('') : `<div class="${CSS_.empty}">No notes yet.</div>`;

    const stickyCards = stickyNotes.map(sn => {
      const safeColor = String(sn.color || '#7c3aed').trim();
      const textHtml = escHtml(sn.text || '');
      const label = sn.msgId
        ? `Msg ${String(sn.msgId).slice(-6)}${Number.isFinite(sn.off) ? ` · off ${sn.off}` : ''}`
        : `Anchor ${sn.off}`;

      const tsLabel = new Date(sn.ts || Date.now()).toLocaleString();
      const msgAttr = sn.msgId ? ` ${ATTR_.h2oMsgId}="${escHtml(sn.msgId)}"` : '';

      return `
        <button type="button" class="${CSS_.stickyCard}" ${ATTR_.sticky}="1" ${msgAttr}
          style="background:${escHtml(safeColor)}; color: rgba(17,24,39,0.95);">
          <div class="${CSS_.stickyMeta}">
            <span>${escHtml(label)}</span>
            <span>${escHtml(tsLabel)}</span>
          </div>
          <div class="${CSS_.stickyText}">${textHtml}</div>
        </button>
      `;
    }).join('');

    const stickySection = stickyCards ? `
      <div class="${CSS_.stickySec}">
        <div class="${CSS_.stickyLbl}">Sticky notes</div>
        <div class="${CSS_.stickyGrid}">${stickyCards}</div>
      </div>` : '';


    // uiMem is initialized above (stable)

    const compOpen = !!uiMem.composeOpen;
    const compText = escHtml(uiMem.composeText || '');
    const compColor = String(uiMem.composeColor || 'auto');

    const composeCard = compOpen ? `
      <div class="${CSS_.composeCard}" ${ATTR_.compose}="1">
        <div class="${CSS_.composeMeta}">
          <span>New note</span>
          <button type="button" class="${CSS_.act}" ${ATTR_.composeClose}="1" title="Close">✕</button>
        </div>

        <textarea class="${CSS_.composeTa}" ${ATTR_.composeTa}="1" placeholder="Write…">${compText}</textarea>

        <div class="${CSS_.swRow}">
          ${['auto','amber','blue','green','red','purple','pink','gray'].map(tok => {
            const hex = colorTokenToHex(tok) || 'transparent';
            const on = (tok === (compColor || 'auto'));
            const label = (tok === 'auto') ? 'Auto' : '';
            const tt = tok === 'auto' ? 'Auto (use panel accent)' : tok;
            return `<button type="button" class="${CSS_.sw}" ${ATTR_.pick}="${tok}" aria-pressed="${on}"
                      title="${tt}" style="--sw:${hex};">${label}</button>`;
          }).join('')}
        </div>

        <div class="${CSS_.composeRow}">
          <button type="button" class="${CSS_.btn} ${CSS_.btnPri}" ${ATTR_.composeSave}="1">Save</button>
          <button type="button" class="${CSS_.btn}" ${ATTR_.composeClose}="1">Close</button>
        </div>

        <div class="${CSS_.composeHint}">Enter to save · Shift+Enter for new line · Esc to close</div>
      </div>
    ` : '';


    // NOTE: Toolbar state lives in `ui` (Notes-only); avoid any shared/global state names.
    const isStickyView = (String(ui?.view || 'all') === 'sticky');
    const stickyBlock = stickySection || (isStickyView ? `<div class="${CSS_.empty}">No sticky notes.</div>` : '');
    const bodyHtml = isStickyView
      ? `<div class="${CSS_.list}">${stickyBlock}</div>`
      : `<div class="${CSS_.list}">
           <div class="${CSS_.grid}">
             ${uiMem.composeOpen ? composeCard : ''}
             ${cardsHtml}
           </div>
         </div>
         ${stickySection || ''}`;

    const mainSection = `
      <div class="${CSS_.sec} ${CSS_.wrap}" ${ATTR_.wrap}="1">
        ${tbarHtml}
        <div class="${CSS_.hdr}">
          <span class="${CSS_.title}">Side Notes</span>
          <span class="${CSS_.sub}">Saved per chat · editable here</span>
        </div>

        ${isStickyView ? '' : `
        <div class="${CSS_.compose}">
          <button type="button" class="${CSS_.btn} ${CSS_.btnPri}" ${ATTR_.newBtn}="1">Side Note</button>
          <button type="button" class="${CSS_.btn} ${CSS_.btnPri}" ${ATTR_.clip}="1">Clip Text</button>
        </div>`}

        ${bodyHtml}
      </div>
    `;

    listEl.innerHTML = mainSection;

    // focus composer (after render)
    try {
      const uiMem = VAULT.state?.ui || null;
      if (uiMem?.focusCompose) {
        uiMem.focusCompose = false;
        const ta = listEl.querySelector(`textarea[${ATTR_.composeTa}="1"]`);
        if (ta) {
          ta.focus();
          const n = ta.value.length;
          try { ta.setSelectionRange(n, n); } catch (_) {}
        }
      }
    } catch (_) {}


    // apply dock theme variables
    const wrap = listEl.querySelector(`.${CSS_.wrap}`);
    if (wrap) {
      wrap.style.setProperty('--nt-bg', vars.bg);
      wrap.style.setProperty('--nt-card', vars.card);
      wrap.style.setProperty('--nt-border', vars.border);
      wrap.style.setProperty('--nt-ink', vars.ink);
      wrap.style.setProperty('--nt-sub', vars.sub);
      wrap.style.setProperty('--nt-focus', vars.focus);
      wrap.style.setProperty('--nt-accent', vars.accent || vars.focus);
    }

    if (panelEl) panelEl.dataset[STR_.viewKey] = STR_.tabId;

    // Notes-only bindings
    bindNotesHandlersOnce({ panelEl, listEl }, api);
  }

  /* ───────────────────────────── 8) Dock Registration ───────────────────────────── */

  function registerTab() {
    const Dock = H2O.Dock || H2O.PanelSide || null;
    if (!Dock?.registerTab) return false;

    if (Dock.tabs?.[STR_.tabId]?.__h2oNotesTab) return true;

    Dock.registerTab(STR_.tabId, {
      title: STR_.tabTitle,
      __h2oNotesTab: true,
      render: (ctx) => renderNotesTab(ctx || {}),
    });

    return true;
  }

  /* ───────────────────────────── 9) Boot / Dispose ───────────────────────────── */

  VAULT.state = VAULT.state || {
    booted: false,
    tries: 0,
    rafId: 0,
    ui: { composeOpen: false, composeText: '', composeColor: 'auto', focusCompose: false },
  };

  function boot() {
    try {
      VAULT.diag.bootCount++;
      VAULT.diag.lastBootAt = Date.now();

      if (VAULT.state.booted) return;
      VAULT.state.booted = true;

      if (W[KEY_GUARD_BOOT]) return;
      W[KEY_GUARD_BOOT] = 1;

      watchStickyStore();

      VAULT.state.tries = 0;

      const tick = () => {
        if (registerTab()) {
          DIAG_step('dock:registered', { ok: true });
          VAULT.state.rafId = 0;
          return;
        }
        VAULT.state.tries += 1;
        if (VAULT.state.tries > CFG_.registerMaxTries) {
          DIAG_step('dock:giveup', { tries: VAULT.state.tries });
          VAULT.state.rafId = 0;
          return;
        }
        VAULT.state.rafId = requestAnimationFrame(tick);
      };

      VAULT.state.rafId = requestAnimationFrame(tick);
      DIAG_step('boot:done', { ok: true });
    } catch (err) {
      VAULT.diag.lastError = String(err?.stack || err);
      DIAG_step('boot:crash', VAULT.diag.lastError);
      throw err;
    }
  }

  function dispose() {
    try {
      if (VAULT.state.rafId) { try { cancelAnimationFrame(VAULT.state.rafId); } catch (_) {} }
      VAULT.state.rafId = 0;

      const un = VAULT.state._unbind || [];
      VAULT.state._unbind = [];
      un.forEach(fn => { try { fn(); } catch (_) {} });

      unwatchStickyStore();
      DIAG_step('dispose:done', null);
    } catch (e) {
      DIAG_step('dispose:err', String(e?.stack || e));
    }
  }

  VAULT.api = VAULT.api || {};
  VAULT.api.boot = boot;
  VAULT.api.dispose = dispose;
  VAULT.api.render = renderNotesTab;

  boot();

})();
