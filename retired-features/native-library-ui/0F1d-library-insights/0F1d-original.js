/*
 * R4.7.5 retired Native Library Insights UI archive.
 *
 * Source: src-runtime-base/0F1d.⬛️🗂️ Library Insights 📊🗂️.js
 * Destination: retired-features/native-library-ui/0F1d-library-insights/0F1d-original.js
 *
 * Block 1 of 1 — Entire 0F1d Explorer + Analytics render-only module
 * (pre-R4.7.5 lines 1-1445). The full original file is preserved
 * below. Live 0F1d now exposes only a retired/no-op diagnostic stub
 * and no Explorer or Analytics render API.
 */

// ==H2O Module==
// @h2o-id             0f1d.library_insights
// @name               0F1d.⬛️🗂️ Library Insights 📊🗂️
// @namespace          H2O.Premium.CGX.library_insights
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260426-000004
// @description        Library Insights: Explorer + Analytics UI renderer for Library Workspace. Consumes 0F1c Library Index and renders premium filterable known-chat views/charts without owning data truth.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

(() => {
  'use strict';

  /*
   * 0F1d — Library Insights (Explorer + Analytics UI layer)
   *
   * OWNS:
   *   - Explorer tab rendering: filter controls, grouped known-chat list/table, source/date/category/label/folder/project/tag slicing.
   *   - Analytics tab rendering: summary cards and lightweight chart/diagram rendering.
   *   - UI preferences for Insights-specific filters, grouping, date bucket, chart density, and table cap.
   *   - Diagnostics and a stable render API for 0F1b Library Workspace.
   *
   * MUST NOT OWN:
   *   - Normalized data / stats truth     → 0F1c Library Index
   *   - Library page route/sidebar shell  → 0F1b Library Workspace
   *   - Shared registries/services        → 0F1a Library Core
   *   - Folders/Labels/Categories/etc.    → their 0F owner modules
   *
   * DESIGN:
   *   - Render-only module. No destructive actions. No foreign storage mutation.
   *   - Works when loaded before or after 0F1b/0F1c.
   *   - If 0F1c is missing, shows a clear degraded-state message instead of guessing.
   */

  const W = window;
  const D = document;
  const H2O = (W.H2O = W.H2O || {});

  const BOOT_LOCK = '__h2oLibraryInsightsBooted_v1_0_0';
  const BOOT_TIMER_SET = '__h2oLibraryInsightsBootTimers_v1_0_0';
  const BOOT_MAX_ATTEMPTS = 180;

  function bootWhenLibraryCoreReady(attempt = 0) {
    const core = H2O.LibraryCore;
    if (!core) {
      if (attempt >= BOOT_MAX_ATTEMPTS) {
        try { H2O.LibraryInsightsBootDiag = { ok: false, status: 'library-core-not-found', attempts: attempt, ts: Date.now() }; } catch {}
        return;
      }
      if (!H2O[BOOT_TIMER_SET]) H2O[BOOT_TIMER_SET] = new Set();
      const delay = Math.min(1400, 80 + attempt * 30);
      const timer = W.setTimeout(() => {
        try { H2O[BOOT_TIMER_SET]?.delete?.(timer); } catch {}
        bootWhenLibraryCoreReady(attempt + 1);
      }, delay);
      try { H2O[BOOT_TIMER_SET].add(timer); } catch {}
      return;
    }
    try { H2O.LibraryInsightsBootDiag = { ok: true, status: 'library-core-ready', attempts: attempt, ts: Date.now() }; } catch {}
    runLibraryInsights(core);
  }

  function runLibraryInsights(coreAtBoot) {
    if (H2O[BOOT_LOCK]) return;
    H2O[BOOT_LOCK] = true;

    const MOD = (H2O.LibraryInsights = H2O.LibraryInsights || {});
    MOD.meta = MOD.meta || {
      owner: '0F1d.library_insights',
      label: 'Library Insights',
      phase: 'phase-1-explorer-analytics-ui',
      suite: 'prm',
      host: 'cgx',
    };

    const diag = (MOD.diag = MOD.diag || {
      t0: performance.now(),
      steps: [],
      errors: [],
      bufMax: 180,
      errMax: 50,
    });

    const step = (s, o = '') => {
      try {
        diag.steps.push({ t: Math.round(performance.now() - diag.t0), s: String(s || ''), o: String(o || '') });
        if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax);
      } catch {}
    };

    const err = (s, e) => {
      try {
        diag.errors.push({ t: Math.round(performance.now() - diag.t0), s: String(s || ''), e: String(e?.stack || e || '') });
        if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax);
      } catch {}
    };

    const TOK = 'LI';
    const PID = 'libraryInsights';
    const SkID = 'lins';
    const SUITE = 'prm';
    const HOST = 'cgx';
    const NS_DISK = `h2o:${SUITE}:${HOST}:library-insights`;
    const KEY_PREFS_V1 = `${NS_DISK}:prefs:v1`;
    const CSS_STYLE_ID = `cgxui-${SkID}-style`;
    const ATTR_CGXUI = 'data-cgxui';
    const ATTR_CGXUI_OWNER = 'data-cgxui-owner';
    const ATTR_CGXUI_STATE = 'data-cgxui-state';

    const DEFAULT_COLUMN_ORDER = Object.freeze([
      'title',
      'source',
      'createdAt',
      'lastInteractionAt',
      'turnCount',
      'userTurnCount',
      'answerCount',
      'updatedAt',
      'savedAt',
      'lastSeenAt',
      'observedAt',
      'folder',
      'labels',
      'category',
      'tags',
      'project',
      'state',
      'chatId',
      'nativeOrder',
      'open',
    ]);

    const DEFAULT_VISIBLE_COLUMNS = Object.freeze([
      'title',
      'source',
      'createdAt',
      'lastInteractionAt',
      'turnCount',
      'folder',
      'labels',
      'category',
      'project',
      'open',
    ]);

    const DEFAULT_COLUMN_WIDTHS = Object.freeze({
      title: 280,
      source: 110,
      createdAt: 122,
      lastInteractionAt: 156,
      turnCount: 78,
      userTurnCount: 94,
      answerCount: 86,
      updatedAt: 122,
      savedAt: 122,
      lastSeenAt: 122,
      observedAt: 122,
      folder: 130,
      labels: 150,
      category: 150,
      tags: 150,
      project: 132,
      state: 130,
      chatId: 180,
      nativeOrder: 94,
      open: 64,
    });

    const DEFAULT_PREFS = Object.freeze({
      source: 'all',
      groupBy: 'date',
      dateBucket: 'month',
      dateField: 'createdAt',
      category: 'all',
      label: 'all',
      folder: 'all',
      project: 'all',
      tag: 'all',
      sort: 'newest',
      chartLimit: 12,
      rowLimit: 500,
      density: 'comfortable',
      visibleColumns: DEFAULT_VISIBLE_COLUMNS,
      columnOrder: DEFAULT_COLUMN_ORDER,
      columnWidths: DEFAULT_COLUMN_WIDTHS,
      controlsOpen: '',
    });

    const SOURCE_OPTIONS = Object.freeze([
      ['all', 'All sources'],
      ['archive', 'Saved / Archive'],
      ['imported', 'Imported'],
      ['recents', 'Native Recents'],
      ['folders', 'Folders'],
      ['labels', 'Labels'],
      ['categories', 'Categories'],
      ['projects', 'Projects'],
      ['tags', 'Tags'],
    ]);

    const GROUP_BY_OPTIONS = Object.freeze([
      ['none', 'No classification'],
      ['date', 'Date'],
      ['category', 'Category'],
      ['label', 'Label'],
      ['folder', 'Folder'],
      ['project', 'Project'],
      ['source', 'Source'],
    ]);

    const DATE_BUCKET_OPTIONS = Object.freeze([
      ['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year'],
    ]);

    const DATE_FIELD_OPTIONS = Object.freeze([
      ['createdAt', 'Created'],
      ['lastInteractionAt', 'Last Turn'],
      ['savedAt', 'Saved'],
      ['updatedAt', 'Updated'],
      ['lastSeenAt', 'Last seen'],
      ['observedAt', 'Scanned'],
    ]);

    const SORT_OPTIONS = Object.freeze([
      ['newest', 'Newest'], ['oldest', 'Oldest'], ['title', 'Title'],
      ['source', 'Source'], ['category', 'Category'], ['label', 'Label'],
    ]);

    const TABLE_COLUMNS = Object.freeze([
      { key: 'title', label: 'Title', width: 280, min: 180, max: 620, primary: true, locked: true },
      { key: 'source', label: 'Source', width: 110, min: 82, max: 220 },
      { key: 'createdAt', label: 'Created', width: 122, min: 104, max: 220 },
      { key: 'lastInteractionAt', label: 'Last Turn', width: 156, min: 124, max: 260 },
      { key: 'turnCount', label: 'Turns', width: 78, min: 62, max: 130 },
      { key: 'userTurnCount', label: 'User turns', width: 94, min: 78, max: 150 },
      { key: 'answerCount', label: 'Answers', width: 86, min: 72, max: 150 },
      { key: 'updatedAt', label: 'Updated', width: 122, min: 104, max: 220 },
      { key: 'savedAt', label: 'Saved', width: 122, min: 104, max: 220 },
      { key: 'lastSeenAt', label: 'Last seen', width: 122, min: 104, max: 220 },
      { key: 'observedAt', label: 'Scanned', width: 122, min: 104, max: 220 },
      { key: 'folder', label: 'Folder', width: 130, min: 96, max: 260 },
      { key: 'labels', label: 'Labels', width: 150, min: 104, max: 320 },
      { key: 'category', label: 'Category', width: 150, min: 104, max: 320 },
      { key: 'tags', label: 'Tags', width: 150, min: 104, max: 320 },
      { key: 'project', label: 'Project', width: 132, min: 96, max: 300 },
      { key: 'state', label: 'State', width: 130, min: 96, max: 260 },
      { key: 'chatId', label: 'Chat ID', width: 180, min: 120, max: 320 },
      { key: 'nativeOrder', label: 'Sidebar #', width: 94, min: 76, max: 150 },
      { key: 'open', label: 'Open', width: 64, min: 54, max: 96 },
    ]);
    const TABLE_COLUMN_KEYS = new Set(TABLE_COLUMNS.map((column) => column.key));

    const state = (MOD.state = MOD.state || {
      booted: false,
      lastCtx: null,
      lastRenderAt: 0,
      clean: { nodes: new Set(), timers: new Set(), listeners: new Set() },
    });
    state.clean = state.clean || { nodes: new Set(), timers: new Set(), listeners: new Set() };

    const storage = {
      getJSON(key, fallback = null) {
        try {
          const raw = W.localStorage?.getItem(key);
          return raw == null ? fallback : JSON.parse(raw);
        } catch { return fallback; }
      },
      setJSON(key, value) {
        try { W.localStorage?.setItem(key, JSON.stringify(value)); return true; }
        catch (e) { err(`storage:${key}`, e); return false; }
      },
      del(key) { try { W.localStorage?.removeItem(key); return true; } catch { return false; } },
    };

    function coreNow() { return H2O.LibraryCore || coreAtBoot || null; }
    function indexApi() { const c = coreNow(); return H2O.LibraryIndex || c?.getService?.('library-index') || c?.getOwner?.('library-index') || null; }
    function workspaceApi() { const c = coreNow(); return H2O.LibraryWorkspace || c?.getService?.('library-workspace') || c?.getOwner?.('library-workspace') || null; }

    function shouldInterceptPlainNavigation(event, link = null) {
      if (event?.defaultPrevented) return false;
      if (event?.button && event.button !== 0) return false;
      if (event?.metaKey || event?.ctrlKey || event?.shiftKey || event?.altKey) return false;
      const target = String(link?.getAttribute?.('target') || '').trim().toLowerCase();
      if (target && target !== '_self') return false;
      if (link?.hasAttribute?.('download')) return false;
      return true;
    }

    function openChatHref(href = '', reason = 'explorer-chat') {
      const url = String(href || '').trim();
      if (!url) return false;
      try {
        const workspace = workspaceApi();
        if (workspace?.openNativeChat?.(url, { reason })) return true;
        workspace?.prepareNativeChatNavigation?.(url, reason);
      } catch (error) {
        err(`open-chat:${reason}:workspace`, error);
      }
      try {
        const next = new URL(url, W.location.href);
        if (next.origin !== W.location.origin) return false;
        const current = (W.history?.state && typeof W.history.state === 'object') ? W.history.state : {};
        const nextState = { ...current };
        try { delete nextState.h2o; } catch {}
        W.history.pushState(nextState, '', `${next.pathname}${next.search}${next.hash}`);
        W.setTimeout(() => {
          try { W.dispatchEvent(new PopStateEvent('popstate', { state: W.history?.state || {} })); }
          catch { try { W.dispatchEvent(new Event('popstate')); } catch {} }
        }, 0);
        return true;
      } catch (error) {
        err(`open-chat:${reason}`, error);
        return false;
      }
    }

    function wireChatAnchor(anchor, href = '', reason = 'explorer-chat-link') {
      if (!(anchor instanceof HTMLAnchorElement)) return anchor;
      anchor.addEventListener('click', (event) => {
        if (!shouldInterceptPlainNavigation(event, anchor)) return;
        event.preventDefault();
        openChatHref(href || anchor.href, reason);
      }, true);
      return anchor;
    }

    function normText(raw = '') { return String(raw || '').replace(/\u00a0/g, ' ').trim().replace(/\s+/g, ' '); }
    function lowerText(raw = '') { return normText(raw).toLowerCase(); }
    function escapeHtml(raw = '') { return String(raw || '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m])); }
    function clampInt(v, min, max, fallback) { const n = Number.parseInt(String(v ?? ''), 10); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }

    function normalizeVisibleColumns(raw) {
      const source = Array.isArray(raw) && raw.length ? raw : DEFAULT_VISIBLE_COLUMNS;
      const out = [];
      source.forEach((item) => {
        const key = normText(item);
        if (!TABLE_COLUMN_KEYS.has(key) || out.includes(key)) return;
        out.push(key);
      });
      if (!out.includes('title')) out.unshift('title');
      return out.length ? out : DEFAULT_VISIBLE_COLUMNS.slice();
    }

    function normalizeColumnOrder(raw) {
      const source = Array.isArray(raw) && raw.length ? raw : DEFAULT_COLUMN_ORDER;
      const out = [];
      source.forEach((item) => {
        const key = normText(item);
        if (!TABLE_COLUMN_KEYS.has(key) || out.includes(key)) return;
        out.push(key);
      });
      DEFAULT_COLUMN_ORDER.forEach((key) => {
        if (TABLE_COLUMN_KEYS.has(key) && !out.includes(key)) out.push(key);
      });
      return out;
    }

    function normalizeColumnWidths(raw) {
      const src = raw && typeof raw === 'object' ? raw : {};
      const out = {};
      TABLE_COLUMNS.forEach((column) => {
        const fallback = Number(DEFAULT_COLUMN_WIDTHS[column.key] || column.width || 120) || 120;
        out[column.key] = clampInt(src[column.key], Number(column.min || 48), Number(column.max || 720), fallback);
      });
      return out;
    }

    function normalizePrefs(raw) {
      const src = raw && typeof raw === 'object' ? raw : {};
      const pick = (key, options, fallback) => options.some(([value]) => value === src[key]) ? src[key] : fallback;
      return {
        ...DEFAULT_PREFS,
        source: pick('source', SOURCE_OPTIONS, DEFAULT_PREFS.source),
        groupBy: pick('groupBy', GROUP_BY_OPTIONS, DEFAULT_PREFS.groupBy),
        dateBucket: pick('dateBucket', DATE_BUCKET_OPTIONS, DEFAULT_PREFS.dateBucket),
        dateField: pick('dateField', DATE_FIELD_OPTIONS, DEFAULT_PREFS.dateField),
        category: normText(src.category || DEFAULT_PREFS.category) || DEFAULT_PREFS.category,
        label: normText(src.label || DEFAULT_PREFS.label) || DEFAULT_PREFS.label,
        folder: normText(src.folder || DEFAULT_PREFS.folder) || DEFAULT_PREFS.folder,
        project: normText(src.project || DEFAULT_PREFS.project) || DEFAULT_PREFS.project,
        tag: normText(src.tag || DEFAULT_PREFS.tag) || DEFAULT_PREFS.tag,
        sort: pick('sort', SORT_OPTIONS, DEFAULT_PREFS.sort),
        chartLimit: clampInt(src.chartLimit, 4, 30, DEFAULT_PREFS.chartLimit),
        rowLimit: clampInt(src.rowLimit, 50, 2000, DEFAULT_PREFS.rowLimit),
        density: src.density === 'compact' ? 'compact' : 'comfortable',
        visibleColumns: normalizeVisibleColumns(src.visibleColumns),
        columnOrder: normalizeColumnOrder(src.columnOrder),
        columnWidths: normalizeColumnWidths(src.columnWidths),
        controlsOpen: ['filters', 'views'].includes(src.controlsOpen) ? src.controlsOpen : DEFAULT_PREFS.controlsOpen,
      };
    }

    function getPrefs() { return normalizePrefs(storage.getJSON(KEY_PREFS_V1, null)); }
    function setPrefs(patch = {}) { const next = normalizePrefs({ ...getPrefs(), ...(patch || {}) }); storage.setJSON(KEY_PREFS_V1, { ...next, updatedAt: Date.now() }); return next; }
    function resetPrefs() { storage.setJSON(KEY_PREFS_V1, { ...DEFAULT_PREFS, updatedAt: Date.now() }); return getPrefs(); }

    function ensureStyle() {
      if (D.getElementById(CSS_STYLE_ID)) return;
      const style = D.createElement('style');
      style.id = CSS_STYLE_ID;
      style.setAttribute(ATTR_CGXUI_OWNER, SkID);
      style.textContent = CSS_TEXT();
      D.head.appendChild(style);
      state.clean.nodes.add(style);
    }

    function CSS_TEXT() { return `
/* ===========================
   📊 Library Insights — cgxui (${SkID})
   =========================== */
.cgxui-${SkID}-root{--lins-line:rgba(255,255,255,.10);--lins-soft:rgba(255,255,255,.045);--lins-softer:rgba(255,255,255,.028);--lins-text:var(--text-primary,#fff);--lins-muted:var(--text-secondary,rgba(255,255,255,.70));--lins-faint:var(--text-tertiary,rgba(255,255,255,.48));--lins-accent:#7dd3fc;display:grid;gap:14px;min-width:0;}
.cgxui-${SkID}-hero{position:relative;overflow:hidden;border:1px solid var(--lins-line);border-radius:20px;padding:16px;background:linear-gradient(135deg,rgba(125,211,252,.12),rgba(255,255,255,.035) 42%,rgba(168,85,247,.09));box-shadow:0 18px 50px rgba(0,0,0,.16);}
.cgxui-${SkID}-hero::after{content:"";position:absolute;inset:-80px -120px auto auto;width:260px;height:180px;background:radial-gradient(circle,rgba(125,211,252,.22),transparent 65%);pointer-events:none;}
.cgxui-${SkID}-kicker{color:var(--lins-accent);font-size:11px;font-weight:750;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px;}
.cgxui-${SkID}-title{font-size:20px;line-height:26px;font-weight:720;letter-spacing:-.02em;color:var(--lins-text);}
.cgxui-${SkID}-sub{margin-top:5px;color:var(--lins-muted);font-size:13px;max-width:70ch;}
.cgxui-${SkID}-controls{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:10px;border:1px solid var(--lins-line);border-radius:18px;background:var(--lins-softer);}
.cgxui-${SkID}-field{min-width:0;display:grid;gap:5px;}
.cgxui-${SkID}-field label{font-size:11px;color:var(--lins-faint);font-weight:650;}
.cgxui-${SkID}-field select{width:100%;min-height:34px;border:1px solid rgba(255,255,255,.12);border-radius:11px;background:rgba(255,255,255,.055);color:var(--lins-text);padding:0 9px;outline:none;}
.cgxui-${SkID}-field select:focus{border-color:rgba(125,211,252,.45);box-shadow:0 0 0 3px rgba(125,211,252,.10);}
.cgxui-${SkID}-seg{display:flex;gap:5px;flex-wrap:wrap;align-items:center;}
.cgxui-${SkID}-seg button,.cgxui-${SkID}-action{border:1px solid rgba(255,255,255,.10);border-radius:999px;background:rgba(255,255,255,.04);color:var(--lins-muted);min-height:30px;padding:5px 10px;cursor:pointer;font:inherit;font-size:12px;}
.cgxui-${SkID}-seg button[aria-pressed="true"],.cgxui-${SkID}-action.primary{background:rgba(125,211,252,.15);border-color:rgba(125,211,252,.28);color:#e5f8ff;}
.cgxui-${SkID}-seg button:hover,.cgxui-${SkID}-action:hover{background:rgba(255,255,255,.075);color:var(--lins-text);}
.cgxui-${SkID}-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;}
.cgxui-${SkID}-control-togglebar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.cgxui-${SkID}-toggle{border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(255,255,255,.045);color:var(--lins-muted);min-height:34px;padding:6px 14px;cursor:pointer;font:inherit;font-size:13px;font-weight:680;}
.cgxui-${SkID}-toggle[aria-pressed="true"]{background:rgba(125,211,252,.16);border-color:rgba(125,211,252,.32);color:#e8faff;}
.cgxui-${SkID}-toggle:hover{background:rgba(255,255,255,.08);color:var(--lins-text);}
.cgxui-${SkID}-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--lins-muted);font-size:12px;}
.cgxui-${SkID}-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;}
.cgxui-${SkID}-card{border:1px solid var(--lins-line);border-radius:16px;padding:13px;background:rgba(255,255,255,.035);min-height:84px;}
.cgxui-${SkID}-card-label{font-size:12px;color:var(--lins-muted);}
.cgxui-${SkID}-card-value{font-size:25px;line-height:31px;font-weight:760;letter-spacing:-.02em;margin-top:6px;}
.cgxui-${SkID}-card-note{font-size:12px;color:var(--lins-faint);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cgxui-${SkID}-table-scroll{display:grid;gap:10px;overflow-x:auto;overflow-y:visible;padding-bottom:4px;scrollbar-gutter:stable;-webkit-overflow-scrolling:touch;}
.cgxui-${SkID}-group{border:1px solid var(--lins-line);border-radius:18px;background:rgba(255,255,255,.025);overflow:hidden;min-width:var(--lins-table-min-width,100%);}
.cgxui-${SkID}-group + .cgxui-${SkID}-group{margin-top:10px;}
.cgxui-${SkID}-group-head{min-height:44px;display:flex;align-items:center;justify-content:flex-start;gap:10px;padding:10px 13px;background:rgba(255,255,255,.045);border-bottom:1px solid rgba(255,255,255,.08);min-width:var(--lins-table-min-width,100%);}
.cgxui-${SkID}-group-title{font-weight:690;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cgxui-${SkID}-group-count{color:var(--lins-faint);font-size:12px;flex:0 0 auto;}
.cgxui-${SkID}-columns{position:relative;}
.cgxui-${SkID}-columns summary{list-style:none;display:inline-flex;align-items:center;gap:7px;min-height:32px;border:1px solid rgba(125,211,252,.26);border-radius:999px;background:rgba(125,211,252,.10);color:#e5f8ff;padding:5px 11px;cursor:pointer;font-size:12px;font-weight:650;}
.cgxui-${SkID}-columns summary::-webkit-details-marker{display:none;}
.cgxui-${SkID}-columns-panel{position:absolute;right:0;top:calc(100% + 7px);z-index:8;display:grid;gap:4px;min-width:220px;max-height:min(360px,65vh);overflow:auto;border:1px solid rgba(255,255,255,.14);border-radius:15px;background:rgba(18,34,44,.98);box-shadow:0 18px 40px rgba(0,0,0,.28);padding:8px;}
.cgxui-${SkID}-column-option{display:flex;align-items:center;gap:8px;min-height:30px;border-radius:10px;color:var(--lins-muted);font-size:12px;padding:4px 6px;cursor:pointer;}
.cgxui-${SkID}-column-option:hover{background:rgba(255,255,255,.07);color:var(--lins-text);}
.cgxui-${SkID}-column-option input{accent-color:#7dd3fc;}
.cgxui-${SkID}-table{display:grid;min-width:var(--lins-table-min-width,100%);}
.cgxui-${SkID}-thead,.cgxui-${SkID}-row{display:grid;gap:8px;align-items:center;padding:10px 12px;}
.cgxui-${SkID}-thead{position:sticky;top:0;z-index:2;color:var(--lins-faint);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;background:rgba(255,255,255,.035);box-shadow:0 1px 0 rgba(255,255,255,.06);}
.cgxui-${SkID}-row{min-height:50px;border-top:1px solid rgba(255,255,255,.065);color:var(--lins-muted);font-size:12px;}
.cgxui-${SkID}-row[data-href]{cursor:pointer;}
.cgxui-${SkID}-row:hover{background:rgba(255,255,255,.035);}
.cgxui-${SkID}-cell{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cgxui-${SkID}-cell[data-head="true"]{position:relative;display:flex;align-items:center;gap:6px;padding-right:10px;cursor:grab;user-select:none;touch-action:none;}
.cgxui-${SkID}-cell[data-head="true"]:active{cursor:grabbing;}
.cgxui-${SkID}-cell[data-head="true"]::after{content:"";position:absolute;top:-10px;right:-5px;bottom:-10px;width:1px;background:rgba(255,255,255,.12);pointer-events:none;}
.cgxui-${SkID}-cell[data-head="true"]:last-child::after{display:none;}
.cgxui-${SkID}-cell[data-head="true"][data-drop="before"]{box-shadow:inset 3px 0 0 rgba(125,211,252,.9);}
.cgxui-${SkID}-cell[data-head="true"][data-drop="after"]{box-shadow:inset -3px 0 0 rgba(125,211,252,.9);}
.cgxui-${SkID}-head-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cgxui-${SkID}-resize-handle{position:absolute;top:7px;right:-5px;bottom:7px;width:10px;border-radius:999px;cursor:col-resize;z-index:5;touch-action:none;}
.cgxui-${SkID}-resize-handle::after{content:"";position:absolute;top:-4px;bottom:-4px;left:4px;width:2px;border-radius:999px;background:rgba(255,255,255,.22);}
.cgxui-${SkID}-resize-handle:hover::after{background:rgba(125,211,252,.9);box-shadow:0 0 10px rgba(125,211,252,.35);}
.cgxui-${SkID}-cell[data-primary="true"]{color:var(--lins-text);font-size:13px;font-weight:610;}
.cgxui-${SkID}-title-link{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:inherit;text-decoration:none;}
.cgxui-${SkID}-title-link:hover{color:#e5f8ff;text-decoration:underline;text-underline-offset:3px;}
.cgxui-${SkID}-open{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:5px 8px;background:rgba(125,211,252,.12);color:#dff7ff;text-decoration:none;font-size:11px;}
.cgxui-${SkID}-open:hover{background:rgba(125,211,252,.20);}
.cgxui-${SkID}-chart-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
.cgxui-${SkID}-chart{border:1px solid var(--lins-line);border-radius:18px;padding:13px;background:rgba(255,255,255,.03);min-width:0;}
.cgxui-${SkID}-chart-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px;}
.cgxui-${SkID}-chart-head strong{font-size:13px;}
.cgxui-${SkID}-chart-head span{font-size:12px;color:var(--lins-faint);}
.cgxui-${SkID}-bar-row{display:grid;grid-template-columns:minmax(82px,132px) minmax(0,1fr) 34px;gap:8px;align-items:center;min-height:26px;}
.cgxui-${SkID}-bar-label{font-size:12px;color:var(--lins-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cgxui-${SkID}-track{height:9px;border-radius:999px;background:rgba(255,255,255,.07);overflow:hidden;}
.cgxui-${SkID}-bar{height:100%;border-radius:999px;background:linear-gradient(90deg,rgba(125,211,252,.88),rgba(168,85,247,.72));box-shadow:0 0 18px rgba(125,211,252,.17);}
.cgxui-${SkID}-bar-value{font-size:12px;color:var(--lins-faint);text-align:right;}
.cgxui-${SkID}-empty{border:1px solid var(--lins-line);border-radius:16px;background:rgba(255,255,255,.035);color:var(--lins-muted);padding:18px;}
.cgxui-${SkID}-hint{color:var(--lins-faint);font-size:12px;}
html.cgxui-${SkID}-resizing,html.cgxui-${SkID}-resizing *{cursor:col-resize!important;user-select:none!important;}
@media (max-width: 1100px){.cgxui-${SkID}-controls{grid-template-columns:repeat(2,minmax(0,1fr));}.cgxui-${SkID}-cards{grid-template-columns:repeat(2,minmax(0,1fr));}.cgxui-${SkID}-chart-grid{grid-template-columns:1fr;}}
@media (max-width: 760px){.cgxui-${SkID}-controls,.cgxui-${SkID}-cards{grid-template-columns:1fr;}.cgxui-${SkID}-columns{width:100%;}.cgxui-${SkID}-columns summary{width:100%;justify-content:center;}.cgxui-${SkID}-columns-panel{left:0;right:auto;}.cgxui-${SkID}-cell{white-space:normal;}}
`; }

    function readIndexModel(ctx = {}) {
      const api = indexApi();
      let model = null;
      try { model = api?.getModel?.(); } catch (e) { err('index:getModel', e); }
      if (!model || typeof model.then === 'function') model = null;
      if (!model?.ok && ctx?.model?.ok) model = ctx.model.indexModel || ctx.model;
      return { api, model };
    }

    function knownStoredCount(api, model, fallback = 0) {
      try {
        const reg = api?.readKnownChatRegistry?.();
        const rows = Array.isArray(reg?.rows) ? reg.rows : null;
        if (rows) return rows.length;
      } catch (e) { err('index:readKnownChatRegistry', e); }
      const counts = model?.counts || {};
      return Number(counts.storedKnownChats ?? counts.knownChats ?? counts.allChats ?? fallback) || 0;
    }

    function buildFilters(prefs = getPrefs(), query = '') {
      const filters = { q: String(query || '') };
      if (prefs.source !== 'all') filters.source = prefs.source;
      if (prefs.category !== 'all') filters.category = prefs.category;
      if (prefs.label !== 'all') filters.label = prefs.label;
      if (prefs.folder !== 'all') filters.folder = prefs.folder;
      if (prefs.project !== 'all') filters.project = prefs.project;
      if (prefs.tag !== 'all') filters.tag = prefs.tag;
      filters.dateField = prefs.dateField;
      filters.sort = prefs.sort;
      return filters;
    }

    function safeListChats(api, model, filters, prefs) {
      try { if (api?.listChats) return api.listChats(filters, { sort: prefs.sort, dateField: prefs.dateField }); }
      catch (e) { err('index:listChats', e); }
      return localFilterChats(model?.chats || model?.knownChats || [], filters, prefs);
    }

    function localFilterChats(rows, filters, prefs) {
      const q = lowerText(filters.q || '');
      const hasVal = (needle, values) => {
        if (!needle || needle === 'all') return true;
        const n = lowerText(needle);
        return (Array.isArray(values) ? values : [values]).some((v) => lowerText(itemLabel(v, v)).includes(n));
      };
      const out = (Array.isArray(rows) ? rows : []).filter((chat) => {
        if (q && !lowerText(chat.searchText || [chat.title, chat.chatId, chat.href, chat.sourceText, chat.folderName, chat.labelText, chat.categoryText, chat.projectName, chat.tagText].join(' ')).includes(q)) return false;
        if (!hasVal(filters.source, chat.sources || chat.source)) return false;
        if (!hasVal(filters.folder, [...(chat.folderIds || []), ...(chat.folderNames || []), chat.folderId, chat.folderName])) return false;
        if (!hasVal(filters.label, [...(chat.labelIds || []), ...(chat.labelNames || []), ...(chat.labels || [])])) return false;
        if (!hasVal(filters.category, [...(chat.categoryIds || []), ...(chat.categoryNames || []), ...(chat.categories || [])])) return false;
        if (!hasVal(filters.project, [chat.projectId, chat.projectName])) return false;
        if (!hasVal(filters.tag, [...(chat.tagIds || []), ...(chat.tagNames || []), ...(chat.tags || [])])) return false;
        return true;
      });
      return sortChats(out, prefs.sort, prefs.dateField);
    }

    function sortChats(rows, sort = 'newest', dateField = 'createdAt') {
      const list = rows.slice();
      const getDate = (row) => dateMs(chatDateValue(row, dateField));
      list.sort((a, b) => {
        if (sort === 'oldest') return (getDate(a) - getDate(b)) || String(a.title || '').localeCompare(String(b.title || ''));
        if (sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''));
        if (sort === 'source') return String(a.source || '').localeCompare(String(b.source || '')) || (getDate(b) - getDate(a));
        if (sort === 'category') return String(a.categoryText || '').localeCompare(String(b.categoryText || '')) || (getDate(b) - getDate(a));
        if (sort === 'label') return String(a.labelText || '').localeCompare(String(b.labelText || '')) || (getDate(b) - getDate(a));
        return (getDate(b) - getDate(a)) || String(a.title || '').localeCompare(String(b.title || ''));
      });
      return list;
    }

    function isAllFilterValue(value) {
      return !normText(value) || normText(value) === 'all';
    }

    function wantsNativeRecentsSidebarOrder(prefs, filters = {}) {
      if (prefs?.groupBy !== 'none' || prefs?.source !== 'recents') return false;
      if (normText(filters.q)) return false;
      return ['category', 'label', 'folder', 'project', 'tag'].every((key) => isAllFilterValue(prefs?.[key]));
    }

    function nativeSidebarOrderValue(row) {
      const order = Number(row?.nativeOrder ?? row?.recentOrder ?? row?.sidebarOrder);
      return Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER;
    }

    function arrangeExplorerRows(rows, prefs, filters) {
      const list = Array.isArray(rows) ? rows.slice() : [];
      if (!wantsNativeRecentsSidebarOrder(prefs, filters)) return list;
      return list.sort((a, b) => {
        const order = nativeSidebarOrderValue(a) - nativeSidebarOrderValue(b);
        if (order) return order;
        const bActivity = dateMs(chatDateValue(b, 'lastInteractionAt') || chatDateValue(b, 'updatedAt'));
        const aActivity = dateMs(chatDateValue(a, 'lastInteractionAt') || chatDateValue(a, 'updatedAt'));
        return (bActivity - aActivity) || String(a.title || '').localeCompare(String(b.title || ''));
      });
    }

    function dateMs(value) {
      const raw = String(value || '').trim();
      if (!raw) return 0;
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n < 100000000000 ? n * 1000 : n;
      const parsed = Date.parse(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    function chatDateValue(chat, field = 'createdAt') {
      const f = String(field || 'createdAt');
      if (f === 'best' || f === 'sortAt') {
        return chat?.sortAt || chat?.lastInteractionAt || chat?.lastMessageAt || chat?.updatedAt || chat?.savedAt || chat?.lastSeenAt || chat?.createdAt || chat?.observedAt || '';
      }
      if (f === 'lastInteractionAt') return chat?.lastInteractionAt || chat?.lastMessageAt || chat?.updatedAt || chat?.lastSeenAt || '';
      return chat?.[f] || chat?.dates?.[f] || '';
    }

    function itemLabel(item, fallback = '') {
      if (item == null) return fallback;
      if (typeof item === 'string' || typeof item === 'number') return String(item);
      return normText(item.label || item.name || item.title || item.typeLabel || item.id || item.key || fallback);
    }

    function dateLabel(value) {
      const raw = String(value || '').trim();
      if (!raw) return '—';
      const ms = dateMs(raw);
      if (!ms) return raw.slice(0, 16);
      try { return new Date(ms).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'2-digit' }); }
      catch { return raw.slice(0, 16); }
    }

    function turnLabel(chat) {
      const n = Number(chat?.turnCount || chat?.answerCount || chat?.userTurnCount || 0);
      return Number.isFinite(n) && n > 0 ? String(Math.trunc(n)) : '—';
    }

    function countLabel(value) {
      const n = Number(value || 0);
      return Number.isFinite(n) && n > 0 ? String(Math.trunc(n)) : '—';
    }

    function stateLabel(chat) {
      const flags = [];
      if (chat?.isSaved) flags.push('saved');
      if (chat?.isRecent) flags.push('recent');
      if (chat?.isImported) flags.push('imported');
      if (chat?.isPinned) flags.push('pinned');
      if (chat?.isArchived) flags.push('archived');
      return flags.length ? flags.join(', ') : '—';
    }

    function bucketKeyForChat(chat, prefs) {
      const value = chatDateValue(chat, prefs.dateField);
      return bucketKey(value, prefs.dateBucket) || 'Undated';
    }

    function bucketKey(value, bucket = 'month') {
      const ms = dateMs(value);
      if (!ms) return '';
      const d = new Date(ms);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      if (bucket === 'day') return `${y}-${m}-${day}`;
      if (bucket === 'year') return String(y);
      if (bucket === 'week') {
        const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        const dayNum = x.getUTCDay() || 7;
        x.setUTCDate(x.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((x - yearStart) / 86400000) + 1) / 7);
        return `${x.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
      }
      return `${y}-${m}`;
    }

    function bucketLabel(key, bucket = 'month') {
      if (!key || key === 'Undated') return 'Undated';
      if (bucket === 'month' && /^\d{4}-\d{2}$/.test(key)) {
        const [y, m] = key.split('-').map(Number);
        try { return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { year:'numeric', month:'short' }); } catch {}
      }
      return key;
    }

    function groupRows(rows, prefs) {
      if (prefs.groupBy === 'none') {
        return [{ key:'all', label:'Chats', chats:Array.isArray(rows) ? rows.slice() : [] }];
      }
      const map = new Map();
      const put = (keyRaw, labelRaw, chat) => {
        const key = normText(keyRaw || labelRaw || 'Unassigned') || 'Unassigned';
        const label = normText(labelRaw || key) || 'Unassigned';
        const row = map.get(key) || { key, label, chats: [] };
        row.chats.push(chat);
        map.set(key, row);
      };
      rows.forEach((chat) => {
        if (prefs.groupBy === 'category') {
          const cats = chat.categories?.length ? chat.categories : (chat.categoryNames || []).map((name) => ({ name }));
          if (!cats.length) return put('Unassigned', 'Unassigned', chat);
          cats.forEach((cat) => put(cat.id || cat.name || cat.label, itemLabel(cat), chat));
          return;
        }
        if (prefs.groupBy === 'label') {
          const labels = chat.labels?.length ? chat.labels : (chat.labelNames || []).map((name) => ({ label:name }));
          if (!labels.length) return put('Unlabeled', 'Unlabeled', chat);
          labels.forEach((label) => put(label.key || label.id || label.label, itemLabel(label), chat));
          return;
        }
        if (prefs.groupBy === 'folder') return put(chat.folderId || chat.folderName || 'Unfiled', chat.folderName || 'Unfiled', chat);
        if (prefs.groupBy === 'project') return put(chat.projectId || chat.projectName || 'No project', chat.projectName || 'No project', chat);
        if (prefs.groupBy === 'source') {
          const sources = Array.isArray(chat.sources) && chat.sources.length ? chat.sources : [chat.source || 'unknown'];
          sources.forEach((source) => put(source, source, chat));
          return;
        }
        const key = bucketKeyForChat(chat, prefs);
        put(key, bucketLabel(key, prefs.dateBucket), chat);
      });
      const groups = Array.from(map.values());
      if (prefs.groupBy === 'date') groups.sort((a, b) => String(b.key).localeCompare(String(a.key)));
      else groups.sort((a, b) => b.chats.length - a.chats.length || a.label.localeCompare(b.label));
      return groups;
    }

    function facetRows(model, facetKey, fallbackRows = []) {
      const facets = model?.facets?.[facetKey];
      const rows = Array.isArray(facets) && facets.length ? facets : fallbackRows;
      return (Array.isArray(rows) ? rows : []).map((row) => {
        const id = normText(row.id || row.key || row.label || row.name || row.title);
        const label = normText(row.label || row.name || row.title || row.typeLabel || id);
        const count = Number(row.count ?? row.chatCount ?? row.usageCount ?? 0) || 0;
        return id || label ? { id: id || label, label: count ? `${label || id} (${count})` : (label || id) } : null;
      }).filter(Boolean);
    }

    function makeSelect({ label, value, options, onChange }) {
      const wrap = D.createElement('div');
      wrap.className = `cgxui-${SkID}-field`;
      const lab = D.createElement('label');
      lab.textContent = label;
      const select = D.createElement('select');
      (Array.isArray(options) ? options : []).forEach(([val, text]) => {
        const opt = D.createElement('option');
        opt.value = String(val);
        opt.textContent = String(text);
        select.appendChild(opt);
      });
      select.value = String(value || 'all');
      select.addEventListener('change', () => onChange?.(select.value), true);
      wrap.append(lab, select);
      return wrap;
    }

    function makeSeg(label, value, options, onChange) {
      const wrap = D.createElement('div');
      wrap.className = `cgxui-${SkID}-field`;
      const lab = D.createElement('label');
      lab.textContent = label;
      const seg = D.createElement('div');
      seg.className = `cgxui-${SkID}-seg`;
      options.forEach(([val, text]) => {
        const btn = D.createElement('button');
        btn.type = 'button';
        btn.textContent = text;
        btn.setAttribute('aria-pressed', String(val === value));
        btn.addEventListener('click', () => onChange?.(val), true);
        seg.appendChild(btn);
      });
      wrap.append(lab, seg);
      return wrap;
    }

    function renderHero(root, mode, model, rows = [], knownTotalOverride = null) {
      const hero = D.createElement('div');
      hero.className = `cgxui-${SkID}-hero`;
      const count = rows.length;
      const total = Number(knownTotalOverride ?? model?.counts?.storedKnownChats ?? model?.counts?.knownChats ?? model?.counts?.allChats ?? count) || 0;
      hero.innerHTML = `
        <div class="cgxui-${SkID}-kicker">${mode === 'analytics' ? 'Library Analytics' : 'Library Explorer'}</div>
        <div class="cgxui-${SkID}-title">${mode === 'analytics' ? 'Understand your known-chat system' : 'Browse and classify known chats'}</div>
        <div class="cgxui-${SkID}-sub">${mode === 'analytics'
          ? `Charts are generated from 0F1c Library Index. Showing ${escapeHtml(String(total))} known chat${total === 1 ? '' : 's'} when available.`
          : `Showing ${escapeHtml(String(count))} filtered chat${count === 1 ? '' : 's'} from ${escapeHtml(String(total))} known chat${total === 1 ? '' : 's'}.`}</div>
      `;
      root.appendChild(hero);
    }

    function renderControls(root, ctx, model, prefs, mode, section = 'all') {
      const rerender = () => safeRerender(ctx);
      const update = (patch) => { setPrefs(patch); rerender(); };
      const addAll = (label, rows) => [['all', label], ...rows.map((row) => [row.id, row.label])];
      if (section === 'all' || section === 'filters') {
        const controls = D.createElement('div');
        controls.className = `cgxui-${SkID}-controls`;
        controls.append(
          makeSelect({ label:'Source', value:prefs.source, options:SOURCE_OPTIONS, onChange:(v)=>update({ source:v }) }),
          makeSelect({ label:'Category', value:prefs.category, options:addAll('All categories', facetRows(model, 'categories', model?.categories)), onChange:(v)=>update({ category:v }) }),
          makeSelect({ label:'Label', value:prefs.label, options:addAll('All labels', facetRows(model, 'labels', model?.labels)), onChange:(v)=>update({ label:v }) }),
          makeSelect({ label:'Folder', value:prefs.folder, options:addAll('All folders', facetRows(model, 'folders', model?.folders)), onChange:(v)=>update({ folder:v }) }),
          makeSelect({ label:'Project', value:prefs.project, options:addAll('All projects', facetRows(model, 'projects', model?.projects)), onChange:(v)=>update({ project:v }) }),
          makeSelect({ label:'Tag', value:prefs.tag, options:addAll('All tags', facetRows(model, 'tags', model?.tags)), onChange:(v)=>update({ tag:v }) }),
          makeSelect({ label:'Date field', value:prefs.dateField, options:DATE_FIELD_OPTIONS, onChange:(v)=>update({ dateField:v }) }),
          mode === 'explorer'
            ? makeSelect({ label:'Sort', value:prefs.sort, options:SORT_OPTIONS, onChange:(v)=>update({ sort:v }) })
            : makeSelect({ label:'Chart rows', value:String(prefs.chartLimit), options:[['8','8 rows'],['12','12 rows'],['18','18 rows'],['24','24 rows']], onChange:(v)=>update({ chartLimit:Number(v) }) })
        );
        root.appendChild(controls);
      }

      if (section === 'all' || section === 'views') {
        const lower = D.createElement('div');
        lower.className = `cgxui-${SkID}-controls`;
        lower.append(
          makeSeg('Classify by', prefs.groupBy, GROUP_BY_OPTIONS, (v)=>update({ groupBy:v })),
          makeSeg('Date bucket', prefs.dateBucket, DATE_BUCKET_OPTIONS, (v)=>update({ dateBucket:v })),
        );
        root.appendChild(lower);
      }
    }

    function renderControlToggles(root, ctx, model, prefs, mode = 'explorer') {
      const bar = D.createElement('div');
      bar.className = `cgxui-${SkID}-control-togglebar`;
      const rerender = () => safeRerender(ctx);
      const updateOpen = (next) => {
        setPrefs({ controlsOpen: prefs.controlsOpen === next ? '' : next });
        rerender();
      };
      const filters = D.createElement('button');
      filters.type = 'button';
      filters.className = `cgxui-${SkID}-toggle`;
      filters.textContent = 'Filters';
      filters.setAttribute('aria-pressed', String(prefs.controlsOpen === 'filters'));
      filters.addEventListener('click', () => updateOpen('filters'), true);
      const views = D.createElement('button');
      views.type = 'button';
      views.className = `cgxui-${SkID}-toggle`;
      views.textContent = 'Groups / Views';
      views.setAttribute('aria-pressed', String(prefs.controlsOpen === 'views'));
      views.addEventListener('click', () => updateOpen('views'), true);
      const reset = makeAction('Reset filters', () => { resetPrefs(); rerender(); });
      const refresh = makeAction('Refresh index', async () => {
        const api = indexApi();
        try { await api?.refresh?.('library-insights:manual', { force:true }); } catch (e) { err('manual-refresh', e); }
        await ctx?.refreshWorkspace?.('insights-refresh');
        rerender();
      }, true);
      bar.append(filters, views);
      if (mode === 'explorer') {
        bar.appendChild(makeColumnSelector(prefs, (visibleColumns) => {
          setPrefs({ visibleColumns });
          rerender();
        }));
      }
      bar.append(reset, refresh);
      root.appendChild(bar);
      if (prefs.controlsOpen === 'filters') renderControls(root, ctx, model, prefs, mode, 'filters');
      if (prefs.controlsOpen === 'views') renderControls(root, ctx, model, prefs, mode, 'views');
    }

    function makeAction(label, fn, primary = false) {
      const btn = D.createElement('button');
      btn.type = 'button';
      btn.className = `cgxui-${SkID}-action${primary ? ' primary' : ''}`;
      btn.textContent = label;
      btn.addEventListener('click', (e) => { e.preventDefault(); fn?.(); }, true);
      return btn;
    }

    function renderCards(root, cards) {
      const grid = D.createElement('div');
      grid.className = `cgxui-${SkID}-cards`;
      cards.forEach((card) => {
        const el = D.createElement('div');
        el.className = `cgxui-${SkID}-card`;
        el.innerHTML = `<div class="cgxui-${SkID}-card-label">${escapeHtml(card.label)}</div><div class="cgxui-${SkID}-card-value">${escapeHtml(String(card.value ?? 0))}</div><div class="cgxui-${SkID}-card-note">${escapeHtml(card.note || '')}</div>`;
        grid.appendChild(el);
      });
      root.appendChild(grid);
    }

    function renderExplorer(ctx = {}) {
      ensureStyle();
      state.lastCtx = ctx;
      state.lastRenderAt = Date.now();
      const body = ctx.body;
      if (!(body instanceof HTMLElement)) return null;
      const root = createRoot('explorer');
      body.appendChild(root);
      const { api, model } = readIndexModel(ctx);
      if (!api) return renderMissing(root, 'Library Index is not loaded. Install 0F1c Library Index before using Explorer.');
      const prefs = getPrefs();
      const filters = buildFilters(prefs, ctx.query || '');
      const rows = arrangeExplorerRows(safeListChats(api, model, filters, prefs), prefs, filters);
      const storedKnown = knownStoredCount(api, model, rows.length);
      renderHero(root, 'explorer', model, rows, storedKnown);
      renderCards(root, [
        { label:'Shown', value:rows.length, note:'after current filters' },
        { label:'Known', value:storedKnown, note:'stored in Library registry' },
        { label:'Group', value:labelFor(GROUP_BY_OPTIONS, prefs.groupBy), note:prefs.groupBy === 'date' ? `bucket: ${prefs.dateBucket}` : (prefs.groupBy === 'none' ? 'no classification' : 'classification mode') },
        { label:'Date field', value:labelFor(DATE_FIELD_OPTIONS, prefs.dateField), note:'used for date grouping/sort' },
      ]);
      renderControlToggles(root, ctx, model, prefs, 'explorer');
      const meta = D.createElement('div');
      meta.className = `cgxui-${SkID}-meta`;
      const orderLabel = wantsNativeRecentsSidebarOrder(prefs, filters) ? 'sidebar recents order' : prefs.sort;
      meta.innerHTML = `<span>${escapeHtml(rows.length)} shown · capped at ${escapeHtml(String(prefs.rowLimit))}</span><span>${escapeHtml(orderLabel)} · ${escapeHtml(prefs.groupBy)} · ${escapeHtml(prefs.dateBucket)}</span>`;
      root.appendChild(meta);
      renderGroupedTable(root, rows.slice(0, prefs.rowLimit), prefs, ctx);
      if (rows.length > prefs.rowLimit) renderHint(root, `${rows.length - prefs.rowLimit} more rows hidden by the current row cap.`);
      return root;
    }

    function renderAnalytics(ctx = {}) {
      ensureStyle();
      state.lastCtx = ctx;
      state.lastRenderAt = Date.now();
      const body = ctx.body;
      if (!(body instanceof HTMLElement)) return null;
      const root = createRoot('analytics');
      body.appendChild(root);
      const { api, model } = readIndexModel(ctx);
      if (!api) return renderMissing(root, 'Library Index is not loaded. Install 0F1c Library Index before using Analytics.');
      const prefs = getPrefs();
      const filters = buildFilters(prefs, ctx.query || '');
      let stats = null;
      try { stats = api?.getStats?.({ filters, dateField:prefs.dateField, bucket:prefs.dateBucket }); } catch (e) { err('index:getStats', e); }
      if (!stats) stats = buildLocalStats(model, filters, prefs);
      renderHero(root, 'analytics', model, model?.chats || []);
      const counts = stats.counts || {};
      renderCards(root, [
        { label:'Known chats', value:counts.knownChats || 0, note:'after filters' },
        { label:'Saved', value:counts.savedChats || 0, note:'captured/archive/imported' },
        { label:'Recents', value:counts.recentChats || 0, note:'native recents' },
        { label:'Imported', value:counts.importedChats || 0, note:'imported rows' },
        { label:'Undated', value:counts.undated || 0, note:`missing ${prefs.dateField}` },
        { label:'Bucket', value:prefs.dateBucket, note:`date field: ${prefs.dateField}` },
        { label:'Group', value:labelFor(GROUP_BY_OPTIONS, prefs.groupBy), note:prefs.groupBy === 'none' ? 'no classification' : 'active classification mode' },
        { label:'Charts', value:'6', note:'objective distributions' },
      ]);
      renderControlToggles(root, ctx, model, prefs, 'analytics');
      const grid = D.createElement('div');
      grid.className = `cgxui-${SkID}-chart-grid`;
      grid.append(
        makeChart('Chats over time', stats.dateBuckets || [], { sortByCount:false, limit: prefs.chartLimit + 6 }),
        makeChart('Source distribution', stats.sourceDistribution || [], { limit: prefs.chartLimit }),
        makeChart('Categories', stats.categoryDistribution || [], { limit: prefs.chartLimit }),
        makeChart('Labels', stats.labelDistribution || [], { limit: prefs.chartLimit }),
        makeChart('Folders', stats.folderDistribution || [], { limit: prefs.chartLimit }),
        makeChart('Projects', stats.projectDistribution || [], { limit: prefs.chartLimit }),
      );
      root.appendChild(grid);
      return root;
    }

    function createRoot(mode) {
      const root = D.createElement('div');
      root.className = `cgxui-${SkID}-root`;
      root.setAttribute(ATTR_CGXUI, `${SkID}-${mode}`);
      root.setAttribute(ATTR_CGXUI_OWNER, SkID);
      return root;
    }

    function renderMissing(root, message) {
      const box = D.createElement('div');
      box.className = `cgxui-${SkID}-empty`;
      box.textContent = message;
      root.appendChild(box);
      return root;
    }

    function renderHint(root, text) {
      const hint = D.createElement('div');
      hint.className = `cgxui-${SkID}-hint`;
      hint.textContent = text;
      root.appendChild(hint);
      return hint;
    }

    function orderedTableColumns(prefs) {
      const byKey = new Map(TABLE_COLUMNS.map((column) => [column.key, column]));
      return normalizeColumnOrder(prefs?.columnOrder).map((key) => byKey.get(key)).filter(Boolean);
    }

    function visibleTableColumns(prefs) {
      const keys = normalizeVisibleColumns(prefs?.visibleColumns);
      return orderedTableColumns(prefs).filter((column) => keys.includes(column.key));
    }

    function columnWidthPx(column, prefs) {
      const widths = normalizeColumnWidths(prefs?.columnWidths);
      const fallback = Number(column?.width || DEFAULT_COLUMN_WIDTHS[column?.key] || 120) || 120;
      const min = Number(column?.min || 48) || 48;
      const max = Number(column?.max || 720) || 720;
      return clampInt(widths[column?.key], min, max, fallback);
    }

    function columnGridTemplate(columns, prefs) {
      return (Array.isArray(columns) && columns.length ? columns : visibleTableColumns(prefs || getPrefs()))
        .map((column) => `${columnWidthPx(column, prefs || getPrefs())}px`)
        .join(' ');
    }

    function tablePixelWidth(columns, prefs) {
      const list = Array.isArray(columns) && columns.length ? columns : visibleTableColumns(prefs || getPrefs());
      const colTotal = list.reduce((sum, column) => sum + columnWidthPx(column, prefs || getPrefs()), 0);
      const gapTotal = Math.max(0, list.length - 1) * 8;
      return Math.max(320, colTotal + gapTotal + 24);
    }

    function moveColumnInOrder(orderRaw, fromKey, toKey, after = false) {
      const from = normText(fromKey);
      const to = normText(toKey);
      if (!from || !to || from === to || !TABLE_COLUMN_KEYS.has(from) || !TABLE_COLUMN_KEYS.has(to)) return normalizeColumnOrder(orderRaw);
      const order = normalizeColumnOrder(orderRaw).filter((key) => key !== from);
      const targetIndex = order.indexOf(to);
      if (targetIndex < 0) return normalizeColumnOrder(orderRaw);
      order.splice(targetIndex + (after ? 1 : 0), 0, from);
      return normalizeColumnOrder(order);
    }

    function applyTableGeometry(root, prefs) {
      if (!(root instanceof HTMLElement)) return;
      const p = normalizePrefs(prefs);
      const columns = visibleTableColumns(p);
      const grid = columnGridTemplate(columns, p);
      const width = `${tablePixelWidth(columns, p)}px`;
      root.querySelectorAll(`.cgxui-${SkID}-table-scroll,.cgxui-${SkID}-group,.cgxui-${SkID}-group-head,.cgxui-${SkID}-table`).forEach((node) => {
        if (node instanceof HTMLElement) node.style.setProperty('--lins-table-min-width', width);
      });
      root.querySelectorAll(`.cgxui-${SkID}-thead,.cgxui-${SkID}-row`).forEach((node) => {
        if (node instanceof HTMLElement) node.style.gridTemplateColumns = grid;
      });
    }

    function makeColumnSelector(prefs, onChange) {
      const details = D.createElement('details');
      details.className = `cgxui-${SkID}-columns`;
      const visible = normalizeVisibleColumns(prefs?.visibleColumns);
      const summary = D.createElement('summary');
      summary.textContent = `Columns · ${visible.length}/${TABLE_COLUMNS.length}`;
      const panel = D.createElement('div');
      panel.className = `cgxui-${SkID}-columns-panel`;
      orderedTableColumns(prefs).forEach((column) => {
        const label = D.createElement('label');
        label.className = `cgxui-${SkID}-column-option`;
        const input = D.createElement('input');
        input.type = 'checkbox';
        input.value = column.key;
        input.checked = visible.includes(column.key);
        input.disabled = column.locked === true;
        input.addEventListener('change', () => {
          const next = Array.from(panel.querySelectorAll('input[type="checkbox"]:checked')).map((node) => node.value);
          onChange?.(next);
        }, true);
        const text = D.createElement('span');
        text.textContent = column.label;
        label.append(input, text);
        panel.appendChild(label);
      });
      details.append(summary, panel);
      return details;
    }

    function renderGroupedTable(root, rows, prefs, ctx = {}) {
      const groups = groupRows(rows, prefs);
      if (!groups.length) return renderMissing(root, 'No known chats match the current filters.');
      const columns = visibleTableColumns(prefs);
      const gridTemplate = columnGridTemplate(columns, prefs);
      const tableWidth = `${tablePixelWidth(columns, prefs)}px`;
      const scroller = D.createElement('div');
      scroller.className = `cgxui-${SkID}-table-scroll`;
      scroller.style.setProperty('--lins-table-min-width', tableWidth);
      groups.forEach((group) => {
        const box = D.createElement('div');
        box.className = `cgxui-${SkID}-group`;
        box.style.setProperty('--lins-table-min-width', tableWidth);
        const head = D.createElement('div');
        head.className = `cgxui-${SkID}-group-head`;
        head.style.setProperty('--lins-table-min-width', tableWidth);
        head.innerHTML = `<div class="cgxui-${SkID}-group-title">${escapeHtml(group.label)}</div><div class="cgxui-${SkID}-group-count">${group.chats.length} chat${group.chats.length === 1 ? '' : 's'}</div>`;
        box.appendChild(head);
        const table = D.createElement('div');
        table.className = `cgxui-${SkID}-table`;
        table.style.setProperty('--lins-table-min-width', tableWidth);
        const thead = D.createElement('div');
        thead.className = `cgxui-${SkID}-thead`;
        thead.style.gridTemplateColumns = gridTemplate;
        columns.forEach((column) => {
          thead.appendChild(makeHeaderCell(column, prefs, ctx));
        });
        table.appendChild(thead);
        group.chats.forEach((chat) => table.appendChild(makeChatRow(chat, prefs, columns, gridTemplate)));
        box.appendChild(table);
        scroller.appendChild(box);
      });
      root.appendChild(scroller);
    }

    function clearHeaderDropMarks(root) {
      try {
        (root || D).querySelectorAll?.(`.cgxui-${SkID}-cell[data-head="true"][data-drop]`).forEach((node) => {
          node.removeAttribute('data-drop');
        });
      } catch {}
    }

    function makeHeaderCell(column, prefs, ctx) {
      const cell = D.createElement('div');
      cell.className = `cgxui-${SkID}-cell`;
      cell.setAttribute('data-col', column.key);
      cell.setAttribute('data-head', 'true');
      cell.draggable = true;
      cell.title = 'Drag to reorder. Pull the right edge to resize.';

      const label = D.createElement('span');
      label.className = `cgxui-${SkID}-head-label`;
      label.textContent = column.label;

      const handle = D.createElement('span');
      handle.className = `cgxui-${SkID}-resize-handle`;
      handle.setAttribute('aria-hidden', 'true');
      handle.draggable = false;
      handle.addEventListener('pointerdown', (event) => startColumnResize(event, column, prefs), true);

      cell.addEventListener('dragstart', (event) => {
        if (event.target === handle) {
          event.preventDefault();
          return;
        }
        try {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', column.key);
        } catch {}
        state.dragColumnKey = column.key;
        cell.setAttribute('aria-grabbed', 'true');
      }, true);
      cell.addEventListener('dragover', (event) => {
        const fromKey = state.dragColumnKey || '';
        if (!fromKey || fromKey === column.key) return;
        event.preventDefault();
        try { event.dataTransfer.dropEffect = 'move'; } catch {}
        const rect = cell.getBoundingClientRect();
        const after = event.clientX > rect.left + rect.width / 2;
        clearHeaderDropMarks(cell.closest(`.cgxui-${SkID}-root`));
        cell.setAttribute('data-drop', after ? 'after' : 'before');
      }, true);
      cell.addEventListener('dragleave', (event) => {
        const related = event.relatedTarget instanceof Node ? event.relatedTarget : null;
        if (!related || !cell.contains(related)) cell.removeAttribute('data-drop');
      }, true);
      cell.addEventListener('drop', (event) => {
        const root = cell.closest(`.cgxui-${SkID}-root`);
        const fromKey = state.dragColumnKey || (() => {
          try { return event.dataTransfer.getData('text/plain'); } catch { return ''; }
        })();
        if (!fromKey || fromKey === column.key) return;
        event.preventDefault();
        const rect = cell.getBoundingClientRect();
        const after = event.clientX > rect.left + rect.width / 2;
        const current = getPrefs();
        setPrefs({ columnOrder: moveColumnInOrder(current.columnOrder, fromKey, column.key, after) });
        clearHeaderDropMarks(root);
        safeRerender(ctx);
      }, true);
      cell.addEventListener('dragend', () => {
        cell.removeAttribute('aria-grabbed');
        state.dragColumnKey = '';
        clearHeaderDropMarks(cell.closest(`.cgxui-${SkID}-root`));
      }, true);

      cell.append(label, handle);
      return cell;
    }

    function startColumnResize(event, column, prefs) {
      if (!column?.key) return;
      event.preventDefault();
      event.stopPropagation();
      const root = event.currentTarget?.closest?.(`.cgxui-${SkID}-root`);
      const startX = Number(event.clientX || 0);
      const basePrefs = normalizePrefs(prefs || getPrefs());
      const startWidth = columnWidthPx(column, basePrefs);
      let nextWidth = startWidth;
      const min = Number(column.min || 48) || 48;
      const max = Number(column.max || 720) || 720;
      const html = D.documentElement;
      try { html.classList.add(`cgxui-${SkID}-resizing`); } catch {}

      const onMove = (moveEvent) => {
        const delta = Number(moveEvent.clientX || 0) - startX;
        nextWidth = Math.max(min, Math.min(max, Math.round(startWidth + delta)));
        const livePrefs = normalizePrefs({
          ...getPrefs(),
          columnWidths: { ...getPrefs().columnWidths, [column.key]: nextWidth },
        });
        applyTableGeometry(root, livePrefs);
      };
      const cleanup = () => {
        try { W.removeEventListener('pointermove', onMove, true); } catch {}
        try { W.removeEventListener('pointerup', onUp, true); } catch {}
        try { W.removeEventListener('pointercancel', onUp, true); } catch {}
        try { html.classList.remove(`cgxui-${SkID}-resizing`); } catch {}
      };
      const onUp = () => {
        cleanup();
        const current = getPrefs();
        setPrefs({ columnWidths: { ...current.columnWidths, [column.key]: nextWidth } });
      };
      try { W.addEventListener('pointermove', onMove, true); } catch {}
      try { W.addEventListener('pointerup', onUp, true); } catch {}
      try { W.addEventListener('pointercancel', onUp, true); } catch {}
    }

    function chatColumnText(chat, prefs, col) {
      if (col === 'title') return chat.title || chat.chatId || chat.href || 'Untitled';
      if (col === 'source') return (chat.sources || [chat.source]).filter(Boolean).join(', ') || '—';
      if (col === 'createdAt') return dateLabel(chatDateValue(chat, 'createdAt'));
      if (col === 'lastInteractionAt') return dateLabel(chatDateValue(chat, 'lastInteractionAt'));
      if (col === 'turnCount') return turnLabel(chat);
      if (col === 'userTurnCount') return countLabel(chat?.userTurnCount);
      if (col === 'answerCount') return countLabel(chat?.answerCount);
      if (col === 'updatedAt') return dateLabel(chatDateValue(chat, 'updatedAt'));
      if (col === 'savedAt') return dateLabel(chatDateValue(chat, 'savedAt'));
      if (col === 'lastSeenAt') return dateLabel(chatDateValue(chat, 'lastSeenAt'));
      if (col === 'observedAt') return dateLabel(chatDateValue(chat, 'observedAt'));
      if (col === 'folder') return chat.folderName || (chat.folderNames || []).join(', ') || '—';
      if (col === 'labels') return chat.labelText || (chat.labelNames || []).join(', ') || (chat.labels || []).map(itemLabel).filter(Boolean).join(', ') || '—';
      if (col === 'category') return chat.categoryText || (chat.categoryNames || []).join(', ') || (chat.categories || []).map(itemLabel).filter(Boolean).join(', ') || '—';
      if (col === 'tags') return chat.tagText || (chat.tagNames || []).join(', ') || (chat.tags || []).map(itemLabel).filter(Boolean).join(', ') || '—';
      if (col === 'project') return chat.projectName || '—';
      if (col === 'state') return stateLabel(chat);
      if (col === 'chatId') return chat.chatId || chat.id || '—';
      if (col === 'nativeOrder') {
        const n = Number(chat?.nativeOrder);
        return Number.isFinite(n) ? String(Math.trunc(n) + 1) : '—';
      }
      return dateLabel(chatDateValue(chat, prefs.dateField));
    }

    function makeChatRow(chat, prefs, columns = visibleTableColumns(prefs), gridTemplate = columnGridTemplate(columns, prefs)) {
      const row = D.createElement('div');
      row.className = `cgxui-${SkID}-row`;
      row.style.gridTemplateColumns = gridTemplate;
      if (chat.href) {
        row.setAttribute('data-href', chat.href);
        row.setAttribute('role', 'link');
        row.tabIndex = 0;
        const openRow = (event) => {
          if (event?.target?.closest?.('a,button,input,select,textarea,summary,details,[contenteditable="true"]')) return;
          openChatHref(chat.href, 'explorer-row');
        };
        row.addEventListener('click', openRow, true);
        row.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          openChatHref(chat.href, 'explorer-row-key');
        }, true);
      }
      columns.forEach((column) => {
        const col = column.key;
        if (col === 'open') {
          const openCell = D.createElement('div');
          openCell.className = `cgxui-${SkID}-cell`;
          openCell.setAttribute('data-col', 'open');
          if (chat.href) {
            const a = D.createElement('a');
            a.className = `cgxui-${SkID}-open`;
            a.href = chat.href;
            a.textContent = 'Open';
            wireChatAnchor(a, chat.href, 'explorer-open-link');
            openCell.appendChild(a);
          } else openCell.textContent = '—';
          row.appendChild(openCell);
          return;
        }
        const text = chatColumnText(chat, prefs, col);
        const cell = D.createElement('div');
        cell.className = `cgxui-${SkID}-cell`;
        cell.setAttribute('data-col', col);
        if (column.primary) cell.setAttribute('data-primary', 'true');
        cell.title = String(text || '');
        if (col === 'title' && chat.href) {
          const a = D.createElement('a');
          a.className = `cgxui-${SkID}-title-link`;
          a.href = chat.href;
          a.textContent = String(text || 'Untitled');
          wireChatAnchor(a, chat.href, 'explorer-title-link');
          cell.appendChild(a);
        } else {
          cell.textContent = String(text || '—');
        }
        row.appendChild(cell);
      });
      return row;
    }

    function makeChart(title, rowsRaw = [], opts = {}) {
      const sortByCount = opts.sortByCount !== false;
      const limit = Number(opts.limit || getPrefs().chartLimit || 12) || 12;
      let rows = (Array.isArray(rowsRaw) ? rowsRaw : [])
        .map((row) => ({ key:String(row.key || row.id || row.label || ''), label:itemLabel(row, row.key || row.id || '—'), count:Number(row.count || 0) || 0 }))
        .filter((row) => row.count > 0);
      rows = sortByCount
        ? rows.sort((a,b)=>b.count-a.count || a.label.localeCompare(b.label)).slice(0, limit)
        : rows.sort((a,b)=>String(a.key || a.label).localeCompare(String(b.key || b.label))).slice(-limit);
      const max = Math.max(1, ...rows.map((row) => row.count));
      const card = D.createElement('div');
      card.className = `cgxui-${SkID}-chart`;
      const head = D.createElement('div');
      head.className = `cgxui-${SkID}-chart-head`;
      head.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${rows.length} row${rows.length === 1 ? '' : 's'}</span>`;
      card.appendChild(head);
      if (!rows.length) {
        const empty = D.createElement('div');
        empty.className = `cgxui-${SkID}-empty`;
        empty.textContent = 'No data for this chart.';
        card.appendChild(empty);
        return card;
      }
      rows.forEach((row) => {
        const line = D.createElement('div');
        line.className = `cgxui-${SkID}-bar-row`;
        const label = D.createElement('div');
        label.className = `cgxui-${SkID}-bar-label`;
        label.title = row.label;
        label.textContent = row.label;
        const track = D.createElement('div');
        track.className = `cgxui-${SkID}-track`;
        const bar = D.createElement('div');
        bar.className = `cgxui-${SkID}-bar`;
        bar.style.width = `${Math.max(4, Math.round((row.count / max) * 100))}%`;
        track.appendChild(bar);
        const val = D.createElement('div');
        val.className = `cgxui-${SkID}-bar-value`;
        val.textContent = String(row.count);
        line.append(label, track, val);
        card.appendChild(line);
      });
      return card;
    }

    function labelFor(options, value) {
      const found = options.find(([v]) => v === value);
      return found ? found[1] : value;
    }

    function buildLocalStats(model, filters, prefs) {
      const rows = localFilterChats(model?.chats || model?.knownChats || [], filters, prefs);
      const maps = { date:new Map(), source:new Map(), category:new Map(), label:new Map(), folder:new Map(), project:new Map() };
      let undated = 0;
      const bump = (map, keyRaw, labelRaw) => {
        const key = normText(keyRaw || labelRaw || 'Unassigned') || 'Unassigned';
        const label = normText(labelRaw || key) || key;
        const row = map.get(key) || { key, label, count: 0 };
        row.count += 1;
        map.set(key, row);
      };
      rows.forEach((chat) => {
        const dateValue = chatDateValue(chat, prefs.dateField);
        const bk = bucketKey(dateValue, prefs.dateBucket);
        if (!bk) undated += 1;
        else bump(maps.date, bk, bucketLabel(bk, prefs.dateBucket));
        (chat.sources || [chat.source || 'unknown']).forEach((s) => bump(maps.source, s, s));
        (chat.categories || []).forEach((cat) => bump(maps.category, cat.id || cat.name || cat.label, itemLabel(cat)));
        (chat.labels || []).forEach((label) => bump(maps.label, label.key || label.id || label.label, itemLabel(label)));
        if (chat.folderId || chat.folderName) bump(maps.folder, chat.folderId || chat.folderName, chat.folderName || chat.folderId);
        if (chat.projectId || chat.projectName) bump(maps.project, chat.projectId || chat.projectName, chat.projectName || chat.projectId);
      });
      const arr = (map) => Array.from(map.values()).sort((a,b)=>b.count-a.count || a.label.localeCompare(b.label));
      return {
        counts: { knownChats:rows.length, savedChats:rows.filter((r)=>r.isSaved || r.saved).length, recentChats:rows.filter((r)=>r.isRecent || r.recent).length, importedChats:rows.filter((r)=>r.isImported).length, undated },
        dateBuckets: arr(maps.date), sourceDistribution: arr(maps.source), categoryDistribution: arr(maps.category), labelDistribution: arr(maps.label), folderDistribution: arr(maps.folder), projectDistribution: arr(maps.project),
      };
    }

    function safeRerender(ctx = state.lastCtx) {
      try {
        if (typeof ctx?.requestRender === 'function') return ctx.requestRender();
        if (ctx?.tab === 'analytics') return owner.renderAnalytics(ctx);
        return owner.renderExplorer(ctx);
      } catch (e) { err('safe-rerender', e); }
      return null;
    }

    function registerWithCore() {
      const core = coreNow();
      if (!core) return false;
      try {
        core.registerOwner?.('library-insights', owner, { replace:true });
        core.registerService?.('library-insights', owner, { replace:true });
        core.registerView?.('library-insights', owner, { replace:true });
        step('registered-with-library-core');
        return true;
      } catch (e) { err('register-with-core', e); return false; }
    }

    function selfCheck() {
      const core = coreNow();
      return {
        ok: !!core?.getOwner?.('library-insights') && !!core?.getService?.('library-insights'),
        hasCore: !!core,
        hasIndex: !!indexApi(),
        hasWorkspace: !!workspaceApi(),
        registeredOwner: !!core?.getOwner?.('library-insights'),
        registeredService: !!core?.getService?.('library-insights'),
        registeredView: !!core?.getView?.('library-insights'),
        styleReady: !!D.getElementById(CSS_STYLE_ID),
        prefs: getPrefs(),
        storageKey: KEY_PREFS_V1,
        bootDiag: H2O.LibraryInsightsBootDiag || null,
        diag: { steps: diag.steps.slice(-14), errors: diag.errors.slice(-10) },
      };
    }

    const owner = {
      phase: 'phase-1-explorer-analytics-ui',
      renderExplorer(ctx = {}) { return renderExplorer(ctx); },
      renderAnalytics(ctx = {}) { return renderAnalytics(ctx); },
      getPrefs() { return getPrefs(); },
      setPrefs(patch = {}) { return setPrefs(patch); },
      resetPrefs() { return resetPrefs(); },
      refresh(reason = 'api') { return indexApi()?.refresh?.(`library-insights:${reason}`, { force:false }); },
      ensureStyle() { return ensureStyle(); },
      selfCheck() { return selfCheck(); },
    };

    function exposePublicApi() {
      MOD.owner = owner;
      Object.keys(owner).forEach((key) => {
        if (typeof owner[key] === 'function') MOD[key] = (...args) => owner[key](...args);
      });
      MOD.constants = Object.freeze({ KEY_PREFS_V1, TOK, PID, SkID });
    }

    function boot() {
      if (state.booted) return;
      state.booted = true;
      exposePublicApi();
      registerWithCore();
      const late = W.setTimeout(() => { state.clean.timers.delete(late); registerWithCore(); }, 900);
      state.clean.timers.add(late);
      step('booted');
    }

    boot();
  }

  bootWhenLibraryCoreReady();
})();
