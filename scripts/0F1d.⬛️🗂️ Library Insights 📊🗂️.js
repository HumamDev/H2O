// ==UserScript==
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
// ==/UserScript==

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

    const DEFAULT_PREFS = Object.freeze({
      source: 'all',
      groupBy: 'date',
      dateBucket: 'month',
      dateField: 'sortAt',
      category: 'all',
      label: 'all',
      folder: 'all',
      project: 'all',
      tag: 'all',
      sort: 'newest',
      chartLimit: 12,
      rowLimit: 500,
      density: 'comfortable',
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
      ['sortAt', 'Best date'], ['savedAt', 'Saved'], ['updatedAt', 'Updated'],
      ['lastSeenAt', 'Last seen'], ['createdAt', 'Created'], ['observedAt', 'Observed'],
    ]);

    const SORT_OPTIONS = Object.freeze([
      ['newest', 'Newest'], ['oldest', 'Oldest'], ['title', 'Title'],
      ['source', 'Source'], ['category', 'Category'], ['label', 'Label'],
    ]);

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

    function normText(raw = '') { return String(raw || '').replace(/\u00a0/g, ' ').trim().replace(/\s+/g, ' '); }
    function lowerText(raw = '') { return normText(raw).toLowerCase(); }
    function escapeHtml(raw = '') { return String(raw || '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m])); }
    function clampInt(v, min, max, fallback) { const n = Number.parseInt(String(v ?? ''), 10); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }

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
.cgxui-${SkID}-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--lins-muted);font-size:12px;}
.cgxui-${SkID}-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;}
.cgxui-${SkID}-card{border:1px solid var(--lins-line);border-radius:16px;padding:13px;background:rgba(255,255,255,.035);min-height:84px;}
.cgxui-${SkID}-card-label{font-size:12px;color:var(--lins-muted);}
.cgxui-${SkID}-card-value{font-size:25px;line-height:31px;font-weight:760;letter-spacing:-.02em;margin-top:6px;}
.cgxui-${SkID}-card-note{font-size:12px;color:var(--lins-faint);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cgxui-${SkID}-group{border:1px solid var(--lins-line);border-radius:18px;background:rgba(255,255,255,.025);overflow:hidden;}
.cgxui-${SkID}-group + .cgxui-${SkID}-group{margin-top:10px;}
.cgxui-${SkID}-group-head{min-height:44px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 13px;background:rgba(255,255,255,.045);border-bottom:1px solid rgba(255,255,255,.08);}
.cgxui-${SkID}-group-title{font-weight:690;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cgxui-${SkID}-group-count{color:var(--lins-faint);font-size:12px;flex:0 0 auto;}
.cgxui-${SkID}-table{display:grid;min-width:0;}
.cgxui-${SkID}-thead,.cgxui-${SkID}-row{display:grid;grid-template-columns:minmax(220px,1.7fr) minmax(88px,.6fr) minmax(96px,.6fr) minmax(110px,.65fr) minmax(120px,.75fr) minmax(120px,.75fr) minmax(105px,.65fr) 58px;gap:8px;align-items:center;padding:10px 12px;}
.cgxui-${SkID}-thead{color:var(--lins-faint);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;background:rgba(255,255,255,.025);}
.cgxui-${SkID}-row{min-height:50px;border-top:1px solid rgba(255,255,255,.065);color:var(--lins-muted);font-size:12px;}
.cgxui-${SkID}-row:hover{background:rgba(255,255,255,.035);}
.cgxui-${SkID}-cell{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cgxui-${SkID}-cell[data-primary="true"]{color:var(--lins-text);font-size:13px;font-weight:610;}
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
@media (max-width: 1100px){.cgxui-${SkID}-controls{grid-template-columns:repeat(2,minmax(0,1fr));}.cgxui-${SkID}-cards{grid-template-columns:repeat(2,minmax(0,1fr));}.cgxui-${SkID}-chart-grid{grid-template-columns:1fr;}.cgxui-${SkID}-thead,.cgxui-${SkID}-row{grid-template-columns:minmax(180px,1.4fr) 80px 90px 88px 88px 88px 0 52px;}.cgxui-${SkID}-cell[data-col="project"],.cgxui-${SkID}-thead .cgxui-${SkID}-cell[data-col="project"]{display:none;}}
@media (max-width: 760px){.cgxui-${SkID}-controls,.cgxui-${SkID}-cards{grid-template-columns:1fr;}.cgxui-${SkID}-thead{display:none;}.cgxui-${SkID}-row{grid-template-columns:1fr;gap:4px;}.cgxui-${SkID}-cell{white-space:normal;}.cgxui-${SkID}-cell[data-col="open"]{margin-top:4px;}}
`; }

    function readIndexModel(ctx = {}) {
      const api = indexApi();
      let model = null;
      try { model = api?.getModel?.(); } catch (e) { err('index:getModel', e); }
      if (!model || typeof model.then === 'function') model = null;
      if (!model?.ok && ctx?.model?.ok) model = ctx.model.indexModel || ctx.model;
      return { api, model };
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

    function sortChats(rows, sort = 'newest', dateField = 'sortAt') {
      const list = rows.slice();
      const getDate = (row) => dateMs(row?.[dateField] || row?.dates?.[dateField] || row?.sortAt || row?.updatedAt || row?.savedAt || row?.lastSeenAt || row?.createdAt || '');
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

    function dateMs(value) {
      const raw = String(value || '').trim();
      if (!raw) return 0;
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
      const parsed = Date.parse(raw);
      return Number.isFinite(parsed) ? parsed : 0;
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

    function bucketKeyForChat(chat, prefs) {
      const value = chat?.[prefs.dateField] || chat?.dates?.[prefs.dateField] || chat?.sortAt || chat?.updatedAt || chat?.savedAt || chat?.lastSeenAt || chat?.createdAt || '';
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

    function renderHero(root, mode, model, rows = []) {
      const hero = D.createElement('div');
      hero.className = `cgxui-${SkID}-hero`;
      const count = rows.length;
      const total = model?.counts?.knownChats ?? model?.counts?.allChats ?? count;
      hero.innerHTML = `
        <div class="cgxui-${SkID}-kicker">${mode === 'analytics' ? 'Library Analytics' : 'Library Explorer'}</div>
        <div class="cgxui-${SkID}-title">${mode === 'analytics' ? 'Understand your known-chat system' : 'Browse and classify known chats'}</div>
        <div class="cgxui-${SkID}-sub">${mode === 'analytics'
          ? `Charts are generated from 0F1c Library Index. Showing ${escapeHtml(String(total))} known chat${total === 1 ? '' : 's'} when available.`
          : `Showing ${escapeHtml(String(count))} filtered chat${count === 1 ? '' : 's'} from ${escapeHtml(String(total))} known chat${total === 1 ? '' : 's'}.`}</div>
      `;
      root.appendChild(hero);
    }

    function renderControls(root, ctx, model, prefs, mode) {
      const controls = D.createElement('div');
      controls.className = `cgxui-${SkID}-controls`;
      const rerender = () => safeRerender(ctx);
      const update = (patch) => { setPrefs(patch); rerender(); };
      const addAll = (label, rows) => [['all', label], ...rows.map((row) => [row.id, row.label])];
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

      const lower = D.createElement('div');
      lower.className = `cgxui-${SkID}-controls`;
      lower.append(
        makeSeg('Classify by', prefs.groupBy, GROUP_BY_OPTIONS, (v)=>update({ groupBy:v })),
        makeSeg('Date bucket', prefs.dateBucket, DATE_BUCKET_OPTIONS, (v)=>update({ dateBucket:v })),
      );
      const actions = D.createElement('div');
      actions.className = `cgxui-${SkID}-actions`;
      const reset = makeAction('Reset filters', () => { resetPrefs(); rerender(); });
      const refresh = makeAction('Refresh index', async () => {
        const api = indexApi();
        try { await api?.refresh?.('library-insights:manual', { force:true }); } catch (e) { err('manual-refresh', e); }
        await ctx?.refreshWorkspace?.('insights-refresh');
        rerender();
      }, true);
      actions.append(reset, refresh);
      lower.appendChild(actions);
      root.appendChild(lower);
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
      const rows = safeListChats(api, model, filters, prefs);
      renderHero(root, 'explorer', model, rows);
      renderControls(root, ctx, model, prefs, 'explorer');
      renderCards(root, [
        { label:'Shown', value:rows.length, note:'after current filters' },
        { label:'Known', value:model?.counts?.knownChats ?? model?.counts?.allChats ?? rows.length, note:'saved + recent + indexed' },
        { label:'Group', value:labelFor(GROUP_BY_OPTIONS, prefs.groupBy), note:prefs.groupBy === 'date' ? `bucket: ${prefs.dateBucket}` : 'classification mode' },
        { label:'Date field', value:labelFor(DATE_FIELD_OPTIONS, prefs.dateField), note:'used for date grouping/sort' },
      ]);
      const meta = D.createElement('div');
      meta.className = `cgxui-${SkID}-meta`;
      meta.innerHTML = `<span>${escapeHtml(rows.length)} shown · capped at ${escapeHtml(String(prefs.rowLimit))}</span><span>${escapeHtml(prefs.sort)} · ${escapeHtml(prefs.groupBy)} · ${escapeHtml(prefs.dateBucket)}</span>`;
      root.appendChild(meta);
      renderGroupedTable(root, rows.slice(0, prefs.rowLimit), prefs);
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
      renderControls(root, ctx, model, prefs, 'analytics');
      const counts = stats.counts || {};
      renderCards(root, [
        { label:'Known chats', value:counts.knownChats || 0, note:'after filters' },
        { label:'Saved', value:counts.savedChats || 0, note:'captured/archive/imported' },
        { label:'Recent', value:counts.recentChats || 0, note:'native recents' },
        { label:'Imported', value:counts.importedChats || 0, note:'imported rows' },
        { label:'Undated', value:counts.undated || 0, note:`missing ${prefs.dateField}` },
        { label:'Bucket', value:prefs.dateBucket, note:`date field: ${prefs.dateField}` },
        { label:'Group', value:labelFor(GROUP_BY_OPTIONS, prefs.groupBy), note:'active classification mode' },
        { label:'Charts', value:'6', note:'objective distributions' },
      ]);
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

    function renderGroupedTable(root, rows, prefs) {
      const groups = groupRows(rows, prefs);
      if (!groups.length) return renderMissing(root, 'No known chats match the current filters.');
      groups.forEach((group) => {
        const box = D.createElement('div');
        box.className = `cgxui-${SkID}-group`;
        const head = D.createElement('div');
        head.className = `cgxui-${SkID}-group-head`;
        head.innerHTML = `<div class="cgxui-${SkID}-group-title">${escapeHtml(group.label)}</div><div class="cgxui-${SkID}-group-count">${group.chats.length} chat${group.chats.length === 1 ? '' : 's'}</div>`;
        box.appendChild(head);
        const table = D.createElement('div');
        table.className = `cgxui-${SkID}-table`;
        const thead = D.createElement('div');
        thead.className = `cgxui-${SkID}-thead`;
        ['Title','Source','Date','Folder','Labels','Category','Project','Open'].forEach((label, idx) => {
          const cell = D.createElement('div');
          cell.className = `cgxui-${SkID}-cell`;
          cell.setAttribute('data-col', ['title','source','date','folder','labels','category','project','open'][idx]);
          cell.textContent = label;
          thead.appendChild(cell);
        });
        table.appendChild(thead);
        group.chats.forEach((chat) => table.appendChild(makeChatRow(chat, prefs)));
        box.appendChild(table);
        root.appendChild(box);
      });
    }

    function makeChatRow(chat, prefs) {
      const row = D.createElement('div');
      row.className = `cgxui-${SkID}-row`;
      const dateValue = chat?.[prefs.dateField] || chat?.dates?.[prefs.dateField] || chat?.sortAt || chat?.updatedAt || chat?.savedAt || chat?.lastSeenAt || chat?.createdAt || '';
      const values = [
        ['title', chat.title || chat.chatId || chat.href || 'Untitled', true],
        ['source', (chat.sources || [chat.source]).filter(Boolean).join(', ') || '—'],
        ['date', dateLabel(dateValue)],
        ['folder', chat.folderName || (chat.folderNames || []).join(', ') || '—'],
        ['labels', chat.labelText || (chat.labelNames || []).join(', ') || (chat.labels || []).map(itemLabel).filter(Boolean).join(', ') || '—'],
        ['category', chat.categoryText || (chat.categoryNames || []).join(', ') || (chat.categories || []).map(itemLabel).filter(Boolean).join(', ') || '—'],
        ['project', chat.projectName || '—'],
      ];
      values.forEach(([col, text, primary]) => {
        const cell = D.createElement('div');
        cell.className = `cgxui-${SkID}-cell`;
        cell.setAttribute('data-col', col);
        if (primary) cell.setAttribute('data-primary', 'true');
        cell.title = String(text || '');
        cell.textContent = String(text || '—');
        row.appendChild(cell);
      });
      const openCell = D.createElement('div');
      openCell.className = `cgxui-${SkID}-cell`;
      openCell.setAttribute('data-col', 'open');
      if (chat.href) {
        const a = D.createElement('a');
        a.className = `cgxui-${SkID}-open`;
        a.href = chat.href;
        a.textContent = 'Open';
        openCell.appendChild(a);
      } else openCell.textContent = '—';
      row.appendChild(openCell);
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
        const dateValue = chat?.[prefs.dateField] || chat?.dates?.[prefs.dateField] || chat?.sortAt || '';
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
