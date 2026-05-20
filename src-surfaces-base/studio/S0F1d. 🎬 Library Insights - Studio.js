// ==UserScript==
// @h2o-id             s0f1d.library_insights.studio
// @name               S0F1d. 🎬 Library Insights - Studio
// @namespace          H2O.Premium.CGX.library_insights.studio
// @author             HumamDev
// @version            2.0.0
// @revision           002
// @build              260511-000020
// @description        Studio Library Insights v2: premium Dashboard / Explorer / Analytics surfaces with detail views for Folder, Category, Label, Tag. Renders into the Library overlay region; consumes Library Workspace + Library Index canonical models. Refined visual language with stat cards, sparklines, horizontal bar charts, time-bucketed chat lists, and filter chips.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0F1d Library Insights v2 (Studio)', Date.now());

  const W = window;
  const D = document;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};

  const PREFS_KEY = 'h2o:prm:cgx:library-insights:studio:prefs:v2';

  // ── Diagnostics ────────────────────────────────────────────────────────────
  const diag = { t0: performance.now(), steps: [], errors: [], bufMax: 80, errMax: 25 };
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

  // ── Service accessors ──────────────────────────────────────────────────────
  function getCore()      { return H2O.LibraryCore || null; }
  function getIndex()     { return H2O.LibraryIndex || null; }
  function getWorkspace() { return H2O.LibraryWorkspace || null; }
  function getUIShell()   { return getCore()?.getService?.('ui-shell') || null; }
  function getPageHost()  { return getCore()?.getService?.('page-host') || null; }
  function getRouteSvc()  { return getCore()?.getService?.('route') || null; }

  // ── Preferences (persisted) ────────────────────────────────────────────────
  // Defaults are merged with whatever's in localStorage so old prefs survive a
  // schema bump (e.g. when we added folderFilter/categoryFilter/etc.).
  const PREF_DEFAULTS = {
    view: 'saved',
    groupBy: 'date',
    sort: 'recent',
    search: '',
    folderFilter: '',
    categoryFilter: '',
    labelFilter: '',
    tagFilter: '',
    projectFilter: '',
  };
  function loadPrefs() {
    try { return Object.assign({}, PREF_DEFAULTS, JSON.parse(W.localStorage.getItem(PREFS_KEY) || '{}')); }
    catch { return Object.assign({}, PREF_DEFAULTS); }
  }
  function savePrefs(p) { try { W.localStorage.setItem(PREFS_KEY, JSON.stringify(p || {})); } catch (e) { err('savePrefs', e); } }

  const prefs = loadPrefs();

  // ── State ──────────────────────────────────────────────────────────────────
  const state = {
    rootEl: null,
    renderToken: 0,
    lastRoute: null,
    visible: false,
  };

  // ── Pure helpers ───────────────────────────────────────────────────────────
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
  function el(tag, attrs = {}, children) {
    const node = D.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = String(v);
      else if (k === 'html') node.innerHTML = String(v);
      else if (k === 'text') node.textContent = String(v);
      else if (k === 'on' && v && typeof v === 'object') {
        for (const [ev, fn] of Object.entries(v)) if (typeof fn === 'function') node.addEventListener(ev, fn);
      }
      else if (k === 'data' && v && typeof v === 'object') {
        for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = String(dv);
      }
      else node.setAttribute(k, String(v));
    }
    if (children != null) {
      const arr = Array.isArray(children) ? children : [children];
      for (const c of arr) {
        if (c == null || c === false) continue;
        if (c instanceof Node) node.appendChild(c);
        else node.appendChild(D.createTextNode(String(c)));
      }
    }
    return node;
  }
  function svg(viewBox, paths, opts = {}) {
    const ns = 'http://www.w3.org/2000/svg';
    const s = D.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', viewBox);
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    if (opts.width) s.setAttribute('width', String(opts.width));
    if (opts.height) s.setAttribute('height', String(opts.height));
    if (opts.fill !== undefined) s.setAttribute('fill', String(opts.fill));
    for (const p of (Array.isArray(paths) ? paths : [paths])) {
      const path = D.createElementNS(ns, 'path');
      for (const [k, v] of Object.entries(p || {})) path.setAttribute(k, String(v));
      s.appendChild(path);
    }
    return s;
  }

  // ── Date / time helpers ────────────────────────────────────────────────────
  function asTs(value) {
    if (!value) return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
    const n = Date.parse(String(value));
    return Number.isFinite(n) ? n : 0;
  }
  function dayKey(ts) { const d = new Date(ts || 0); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function dayDiff(a, b) { return Math.floor((b - a) / 86400000); }
  function dateBucketLabel(ts) {
    if (!ts) return 'No date';
    const now = Date.now();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const tsStart = new Date(ts); tsStart.setHours(0, 0, 0, 0);
    const diff = dayDiff(tsStart.getTime(), todayStart.getTime());
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return 'This week';
    if (diff < 30) return 'This month';
    const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
    return sameYear
      ? new Intl.DateTimeFormat(undefined, { month: 'long' }).format(ts)
      : new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long' }).format(ts);
  }
  function formatDateShort(ts) {
    if (!ts) return '';
    try { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(ts); }
    catch { return ''; }
  }
  function formatNumber(n) {
    const v = Number(n) || 0;
    if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
    return String(v);
  }

  // ── Visual primitives ──────────────────────────────────────────────────────
  function Sparkline(values, { width = 168, height = 36, color = 'var(--wb-library-accent)' } = {}) {
    const ns = 'http://www.w3.org/2000/svg';
    const s = D.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', `0 0 ${width} ${height}`);
    s.setAttribute('class', 'wbInsightsSparkline');
    s.setAttribute('aria-hidden', 'true');
    const data = (Array.isArray(values) && values.length ? values : [0, 0]).map((v) => Number(v) || 0);
    const max = Math.max(1, ...data);
    const step = data.length > 1 ? width / (data.length - 1) : width;
    const points = data.map((v, i) => `${(i * step).toFixed(2)},${(height - (v / max) * (height - 4) - 2).toFixed(2)}`);
    const lineD = `M ${points.join(' L ')}`;
    const areaD = `${lineD} L ${(width).toFixed(2)},${(height).toFixed(2)} L 0,${(height).toFixed(2)} Z`;
    const grad = D.createElementNS(ns, 'linearGradient');
    grad.setAttribute('id', 'wbSparkGrad');
    grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
    const stop1 = D.createElementNS(ns, 'stop');
    stop1.setAttribute('offset', '0%'); stop1.setAttribute('stop-color', color); stop1.setAttribute('stop-opacity', '0.42');
    const stop2 = D.createElementNS(ns, 'stop');
    stop2.setAttribute('offset', '100%'); stop2.setAttribute('stop-color', color); stop2.setAttribute('stop-opacity', '0');
    grad.append(stop1, stop2);
    const defs = D.createElementNS(ns, 'defs');
    defs.appendChild(grad);
    s.appendChild(defs);
    const area = D.createElementNS(ns, 'path');
    area.setAttribute('d', areaD); area.setAttribute('fill', 'url(#wbSparkGrad)'); area.setAttribute('stroke', 'none');
    s.appendChild(area);
    const line = D.createElementNS(ns, 'path');
    line.setAttribute('d', lineD); line.setAttribute('fill', 'none');
    line.setAttribute('stroke', color); line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-linejoin', 'round'); line.setAttribute('stroke-linecap', 'round');
    s.appendChild(line);
    return s;
  }

  function StatCard({ value, label, hint, accent }) {
    return el('div', { class: 'wbStatCard', data: accent ? { accent: 'true' } : undefined }, [
      el('div', { class: 'wbStatCardVal' }, formatNumber(value)),
      el('div', { class: 'wbStatCardLabel' }, label),
      hint ? el('div', { class: 'wbStatCardHint' }, hint) : null,
    ]);
  }

  function Pill({ label, count, active = false, onClick, accent }) {
    const node = el('button', {
      class: `wbPill${active ? ' is-active' : ''}`,
      type: 'button',
      data: accent ? { accent } : undefined,
      on: { click: onClick },
    }, [
      el('span', { class: 'wbPillLabel' }, label),
      (count != null) ? el('span', { class: 'wbPillCount' }, formatNumber(count)) : null,
    ]);
    return node;
  }

  function BarRow({ name, count, total, swatch }) {
    // A zero count must read as 0% — the previous Math.max(2, …) floor was
    // only meant to keep tiny but non-zero bars visible. Apply the visual
    // minimum only when count > 0; otherwise 0 stays 0.
    const rawPct = total > 0 ? Math.round((count / total) * 100) : 0;
    const pct = count > 0 ? Math.max(2, Math.min(100, rawPct)) : 0;
    return el('div', { class: 'wbBarRow' }, [
      swatch ? el('span', { class: 'wbBarSwatch', style: `background:${swatch}` }) : null,
      el('div', { class: 'wbBarRowBody' }, [
        el('div', { class: 'wbBarRowHead' }, [
          el('span', { class: 'wbBarRowName' }, name),
          el('span', { class: 'wbBarRowCount' }, [
            el('strong', {}, formatNumber(count)),
            el('span', { class: 'wbBarRowPct' }, ` · ${pct}%`),
          ]),
        ]),
        el('div', { class: 'wbBarRowTrack' }, [
          el('div', { class: 'wbBarRowFill', style: `width:${pct}%` }),
        ]),
      ]),
    ]);
  }

  // Resolve a row's snapshot id with defensive fallbacks. The Library Index
  // normalizer already checks the common keys, but if the archive ever
  // returns a shape it hasn't seen we fall back to row.raw so click-to-open
  // never silently fails. The route used (#/read/<snapshotId>) is exactly
  // the one studio.js's saved-list `button.addEventListener('click', ...)`
  // navigates to (studio.js line 2659) — same Studio reader is reused.
  function resolveSnapshotId(row) {
    if (!row) return '';
    const raw = row.raw || {};
    return String(
      row.snapshotId
      || raw.snapshotId
      || raw.snapId
      || raw.snapshot_id
      || raw.snapshot?.id
      || raw.snapshot?.snapshotId
      || raw.meta?.snapshotId
      || ''
    ).trim();
  }

  // Phase 5 — flatten state regardless of whether the row carries the new
  // normalized shape (state: { isLinked, isSaved, ... }) or the legacy shape
  // (state on raw only). Callers always go through this helper so the
  // upstream S0F1c pass-through can be tightened later without churn here.
  function getRowState(row) {
    if (!row) return { isLinked: false, isSaved: false, isImported: false };
    const a = (row.state && typeof row.state === 'object') ? row.state : null;
    const b = (row.raw && row.raw.state && typeof row.raw.state === 'object') ? row.raw.state : null;
    return {
      isLinked:   !!(a?.isLinked   || b?.isLinked),
      isSaved:    !!(a?.isSaved    || b?.isSaved),
      isImported: !!(a?.isImported || b?.isImported),
    };
  }

  // Phase 5 — produce a real chatgpt.com URL from the row's stored link
  // provenance. Returns '' for records with no source URL (imported-only).
  function resolveLinkedUrl(row) {
    if (!row) return '';
    const r = row.raw || {};
    const raw = String(
      row.linkSourceHref
      || row.href
      || row.normalizedHref
      || r.linkSourceHref
      || r.href
      || r.normalizedHref
      || ''
    ).trim();
    if (!raw) return '';
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    if (raw.startsWith('/')) return `https://chatgpt.com${raw}`;
    return '';
  }

  function ChatRow(row, idx) {
    const sid = resolveSnapshotId(row);
    const st = getRowState(row);
    const linkedUrl = resolveLinkedUrl(row);
    // Click target priority: saved+snapshot → Studio reader; linked-only →
    // original ChatGPT chat; otherwise the row is inert.
    const opensReader = !!sid && !st.isDeleted;
    const opensExternal = !opensReader && !!(st.isLinked && linkedUrl);

    const meta = [];
    if (row.folderName) meta.push(`📁 ${row.folderName}`);
    else if (row.folderId) meta.push(`📁 ${row.folderId.slice(0, 8)}…`);
    if (row.categoryName) meta.push(`◆ ${row.categoryName}`);
    if (row.messageCount) meta.push(`${row.messageCount} turns`);
    const ts = asTs(row.updatedAt || row.capturedAt);
    if (ts) meta.push(formatDateShort(ts));

    const tags = (row.tags || []).slice(0, 3);
    const labels = (row.labels || []).slice(0, 3);

    // Linked / Saved / Imported chips. Saved subsumes Linked visually.
    // Imported (saved-only with no chatId) is a special case: show the
    // Imported chip alongside Saved so the user knows the record has no
    // native source URL to fall back to.
    const chips = [];
    if (st.isSaved) chips.push(['Saved', 'wbRowChip--saved']);
    else if (st.isLinked) chips.push(['Linked', 'wbRowChip--linked']);
    if (st.isImported) chips.push(['Imported', 'wbRowChip--imported']);

    // Anchor href: prefer the reader hash for saved rows so cmd-click "open
    // in new tab" stays inside Studio; for linked-only rows the href IS the
    // original ChatGPT URL so cmd-click opens it natively.
    const anchorHref = opensReader
      ? `#/read/${encodeURIComponent(sid)}`
      : (opensExternal ? linkedUrl : '#');
    const inertAria = (opensReader || opensExternal) ? null : 'true';

    const titleRow = el('div', { class: 'wbChatRowTitleRow' }, [
      el('div', { class: 'wbChatRowTitle' }, row.title || row.chatId || 'Untitled chat'),
      chips.length
        ? el('div', { class: 'wbChatRowChips' }, chips.map(([label, klass]) =>
            el('span', { class: `wbRowChip ${klass}`, 'aria-hidden': 'true' }, label)
          ))
        : null,
    ]);

    const children = [
      el('div', { class: 'wbChatRowMain' }, [
        titleRow,
        el('div', { class: 'wbChatRowMeta' }, meta.join(' · ') || ''),
      ]),
      ((tags.length + labels.length) > 0) ? el('div', { class: 'wbChatRowTags' }, [
        ...tags.map((t) => el('span', { class: 'wbChatRowTag', data: { kind: 'tag' } }, `#${t}`)),
        ...labels.map((l) => el('span', { class: 'wbChatRowTag', data: { kind: 'label' } }, l)),
      ]) : null,
    ];

    // Secondary action: a compact "Open original ChatGPT chat" button shown
    // when the row is a SAVED record that also has a source URL. Linked-only
    // rows already open the original on primary click, so no secondary
    // affordance is needed for them. Imported-only saves with no source URL
    // omit the button entirely.
    if (opensReader && linkedUrl) {
      const openExt = el('button', {
        type: 'button',
        class: 'wbChatRowOpenExternal',
        title: 'Open original ChatGPT chat',
        'aria-label': 'Open original ChatGPT chat',
        data: { url: linkedUrl },
      }, [
        el('span', { class: 'wbChatRowOpenExternalIcon', 'aria-hidden': 'true' }, '↗'),
      ]);
      openExt.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        try { W.open(linkedUrl, '_blank', 'noopener'); } catch {}
      });
      children.push(openExt);
    }

    const anchor = el('a', {
      class: 'wbChatRow',
      href: anchorHref,
      data: {
        chatId:     row.chatId || '',
        snapshotId: sid,
        view:       row.view || '',
        idx:        String(idx),
        linked:     st.isLinked ? '1' : '0',
        saved:      st.isSaved  ? '1' : '0',
        opens:      opensReader ? 'reader' : (opensExternal ? 'external' : 'none'),
      },
      title: row.title || row.chatId || '',
      'aria-disabled': inertAria,
    }, children);

    anchor.addEventListener('click', (ev) => {
      // Inert rows: nothing to do.
      if (!opensReader && !opensExternal) { ev.preventDefault(); return; }
      // Preserve modifier/middle-click semantics for both branches: cmd-click
      // on a saved row opens the reader in a new tab; cmd-click on a linked
      // row opens the native chat in a new tab.
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;

      if (opensExternal) {
        // Linked-only: programmatically open the native URL so the in-Studio
        // hash doesn't move. Anchor href IS already the URL so default
        // navigation would also try; we preventDefault to keep Studio's
        // route stable and explicitly use noopener.
        ev.preventDefault();
        try { W.open(linkedUrl, '_blank', 'noopener'); } catch {}
        return;
      }

      // Saved path — identical to the prior implementation. Anchor's default
      // navigation sets location.hash; studio.js's hashchange listener calls
      // renderRoute → renderReader(snapshotId). Microtask poll force-sets
      // the hash if a future click-delegation handler suppresses the default.
      const target = `#/read/${encodeURIComponent(sid)}`;
      const before = W.location.hash;
      W.queueMicrotask(() => {
        if (W.location.hash === before && before !== target) {
          W.location.hash = target;
        }
      });
    });

    return anchor;
  }

  // ── Activity helpers ───────────────────────────────────────────────────────
  function buildActivitySeries(rows, days = 30) {
    const buckets = new Array(days).fill(0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const r of rows) {
      const ts = asTs(r.updatedAt || r.capturedAt);
      if (!ts) continue;
      const d = new Date(ts); d.setHours(0, 0, 0, 0);
      const offset = Math.floor((today.getTime() - d.getTime()) / 86400000);
      if (offset >= 0 && offset < days) buckets[days - 1 - offset] += 1;
    }
    return buckets;
  }

  // ── Top-N facet utility ────────────────────────────────────────────────────
  function topN(facetMap, n = 6) {
    return Object.entries(facetMap || {})
      .map(([k, v]) => [k, Array.isArray(v) ? v.length : Number(v) || 0])
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  }

  // ── ID → display name resolution ───────────────────────────────────────────
  // Facets are keyed by canonical IDs (e.g. f_7050…, cat_research_analysis).
  // To render a human name we look up — in priority order:
  //   1. The pageData catalog (Workspace.getFolders / getLabels / getCategories
  //      results that show() prefetched).
  //   2. The Library Index rows, which carry folderName / categoryName for any
  //      chat that hit that facet.
  //   3. Fall back to the raw ID (better than blank).
  //
  // Tags are stored by name directly (no IDs); projects have only IDs today
  // and no catalog. labelFor() handles both cases gracefully.
  function buildFolderNameMap(idx) {
    const map = new Map();
    for (const f of (pageData.folders || [])) {
      const id = String(f?.id || f?.folderId || '').trim();
      const name = String(f?.name || f?.folderName || f?.label || '').trim();
      if (id && name) map.set(id, name);
    }
    if (idx) {
      for (const r of idx.getAll()) {
        if (r.folderId && r.folderName && !map.has(r.folderId)) {
          map.set(r.folderId, r.folderName);
        }
      }
    }
    return map;
  }
  function buildCategoryNameMap(idx) {
    const map = new Map();
    for (const c of (pageData.categories || [])) {
      const id = String(c?.id || c?.categoryId || '').trim();
      const name = String(c?.name || c?.categoryName || c?.label || '').trim();
      if (id && name) map.set(id, name);
    }
    if (idx) {
      for (const r of idx.getAll()) {
        if (r.categoryId && r.categoryName && !map.has(r.categoryId)) {
          map.set(r.categoryId, r.categoryName);
        }
      }
    }
    return map;
  }
  function buildLabelNameMap() {
    const map = new Map();
    for (const lb of (pageData.labels || [])) {
      const id = String(lb?.id || lb?.labelId || lb?.name || '').trim();
      const name = String(lb?.name || lb?.label || lb?.labelName || id).trim();
      if (id && name) map.set(id, name);
    }
    return map;
  }
  function labelFor(kind, id, idx) {
    const raw = String(id || '');
    if (!raw) return '';
    if (kind === 'folder')   return buildFolderNameMap(idx).get(raw)   || raw;
    if (kind === 'category') return buildCategoryNameMap(idx).get(raw) || raw;
    if (kind === 'label')    return buildLabelNameMap().get(raw)       || raw;
    // tags = name-keyed, projects = id-only (no catalog) — return raw.
    return raw;
  }

  // ── Filter chips row ───────────────────────────────────────────────────────
  // `opts.hideViewChips` is set by the Saved / Pinned / Archive tabs — those
  // tabs already lock the view via the route, so showing duplicate chips would
  // either be confusing or let the user desync the chip from the tab.
  function FilterChips(opts = {}) {
    const onSet = (key, value) => () => {
      prefs[key] = value; savePrefs(prefs);
      step('prefs', `${key}=${value}`);
      render();
    };
    // Linked pill is conditional: only render when there's at least one
    // linked-only record so the filter row stays clean on installs that
    // never used "Add to Library". Counts come from idx.counts() which
    // the renderer captures alongside rows.
    const linkedCount = (opts && opts.linkedCount) || 0;
    return el('div', { class: 'wbFilterChips' }, [
      opts.hideViewChips ? null : el('div', { class: 'wbFilterChipGroup' }, [
        Pill({ label: 'Saved',   active: prefs.view === 'saved',   onClick: onSet('view', 'saved') }),
        Pill({ label: 'Pinned',  active: prefs.view === 'pinned',  onClick: onSet('view', 'pinned') }),
        Pill({ label: 'Archive', active: prefs.view === 'archive', onClick: onSet('view', 'archive') }),
        linkedCount > 0
          ? Pill({ label: 'Linked', count: linkedCount, active: prefs.view === 'linked', onClick: onSet('view', 'linked') })
          : null,
      ]),
      opts.hideViewChips ? null : el('span', { class: 'wbFilterChipDivider' }),
      el('div', { class: 'wbFilterChipGroup' }, [
        el('span', { class: 'wbFilterChipLabel' }, 'Group by'),
        Pill({ label: 'Date',     active: prefs.groupBy === 'date',     onClick: onSet('groupBy', 'date') }),
        Pill({ label: 'Folder',   active: prefs.groupBy === 'folder',   onClick: onSet('groupBy', 'folder') }),
        Pill({ label: 'Category', active: prefs.groupBy === 'category', onClick: onSet('groupBy', 'category') }),
        Pill({ label: 'Label',    active: prefs.groupBy === 'label',    onClick: onSet('groupBy', 'label') }),
        Pill({ label: 'Project',  active: prefs.groupBy === 'project',  onClick: onSet('groupBy', 'project') }),
        Pill({ label: 'None',     active: prefs.groupBy === 'none',     onClick: onSet('groupBy', 'none') }),
      ]),
      opts.hideSortChips ? null : el('span', { class: 'wbFilterChipDivider' }),
      opts.hideSortChips ? null : el('div', { class: 'wbFilterChipGroup' }, [
        el('span', { class: 'wbFilterChipLabel' }, 'Sort'),
        Pill({ label: 'Recent',    active: prefs.sort === 'recent',    onClick: onSet('sort', 'recent') }),
        Pill({ label: 'Oldest',    active: prefs.sort === 'oldest',    onClick: onSet('sort', 'oldest') }),
        Pill({ label: 'A → Z',     active: prefs.sort === 'az',        onClick: onSet('sort', 'az') }),
        Pill({ label: 'Most turns', active: prefs.sort === 'mostTurns', onClick: onSet('sort', 'mostTurns') }),
      ]),
    ]);
  }

  function SearchBar() {
    const input = el('input', {
      type: 'search', class: 'wbInsightsSearch', placeholder: 'Search your library…',
      value: prefs.search || '', autocomplete: 'off', spellcheck: 'false',
      on: {
        input: (ev) => {
          prefs.search = String(ev.target.value || '');
          savePrefs(prefs);
          // Debounce a render
          if (state._searchTimer) clearTimeout(state._searchTimer);
          state._searchTimer = setTimeout(() => render(), 140);
        },
      },
    });
    const wrap = el('label', { class: 'wbInsightsSearchWrap' }, [
      el('span', { class: 'wbIco wbIco--search', html: '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><circle cx="11" cy="11" r="5.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m15.1 15.1 3.15 3.15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' }),
      input,
      prefs.search ? el('button', {
        type: 'button', class: 'wbInsightsSearchClear', 'aria-label': 'Clear search',
        on: { click: () => { prefs.search = ''; savePrefs(prefs); render(); } },
      }, '×') : null,
    ]);
    return wrap;
  }

  // ── Sort + group ───────────────────────────────────────────────────────────
  function sortRows(rows) {
    const list = rows.slice();
    if (prefs.sort === 'recent') {
      list.sort((a, b) => asTs(b.updatedAt || b.capturedAt) - asTs(a.updatedAt || a.capturedAt));
    } else if (prefs.sort === 'oldest') {
      list.sort((a, b) => asTs(a.updatedAt || a.capturedAt) - asTs(b.updatedAt || b.capturedAt));
    } else if (prefs.sort === 'az') {
      list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
    } else if (prefs.sort === 'mostTurns') {
      list.sort((a, b) => (Number(b.messageCount) || 0) - (Number(a.messageCount) || 0));
    }
    return list;
  }

  function groupRows(rows) {
    if (prefs.groupBy === 'none') return [{ key: '', label: '', rows }];
    if (prefs.groupBy === 'folder') {
      const buckets = new Map();
      for (const r of rows) {
        const key = r.folderId || '__unfiled__';
        const label = r.folderName || (r.folderId ? r.folderId : 'Unfiled');
        if (!buckets.has(key)) buckets.set(key, { key, label, rows: [] });
        buckets.get(key).rows.push(r);
      }
      return [...buckets.values()].sort((a, b) => b.rows.length - a.rows.length);
    }
    if (prefs.groupBy === 'category') {
      const buckets = new Map();
      for (const r of rows) {
        const key = r.categoryId || '__uncategorized__';
        const label = r.categoryName || (r.categoryId ? r.categoryId : 'Uncategorized');
        if (!buckets.has(key)) buckets.set(key, { key, label, rows: [] });
        buckets.get(key).rows.push(r);
      }
      return [...buckets.values()].sort((a, b) => b.rows.length - a.rows.length);
    }
    if (prefs.groupBy === 'label') {
      // Labels are multi-valued — a chat with two labels appears in both
      // buckets. Unlabeled chats go to a synthetic bucket so they remain visible.
      const buckets = new Map();
      for (const r of rows) {
        const labels = Array.isArray(r.labels) && r.labels.length ? r.labels : ['__unlabeled__'];
        for (const lab of labels) {
          const key = String(lab);
          const label = key === '__unlabeled__' ? 'Unlabeled' : key;
          if (!buckets.has(key)) buckets.set(key, { key, label, rows: [] });
          buckets.get(key).rows.push(r);
        }
      }
      return [...buckets.values()].sort((a, b) => b.rows.length - a.rows.length);
    }
    if (prefs.groupBy === 'project') {
      const buckets = new Map();
      for (const r of rows) {
        const key = r.projectId || '__unassigned__';
        const label = key === '__unassigned__' ? 'No project' : key;
        if (!buckets.has(key)) buckets.set(key, { key, label, rows: [] });
        buckets.get(key).rows.push(r);
      }
      return [...buckets.values()].sort((a, b) => b.rows.length - a.rows.length);
    }
    // Default: date bucket
    const buckets = new Map();
    for (const r of rows) {
      const label = dateBucketLabel(asTs(r.updatedAt || r.capturedAt));
      if (!buckets.has(label)) buckets.set(label, { key: label, label, rows: [], _orderTs: asTs(r.updatedAt || r.capturedAt) || 0 });
      const b = buckets.get(label);
      b.rows.push(r);
      b._orderTs = Math.max(b._orderTs, asTs(r.updatedAt || r.capturedAt) || 0);
    }
    return [...buckets.values()].sort((a, b) => b._orderTs - a._orderTs);
  }

  // Canonical row search predicate. Used by Explorer / Recents / Organize so
  // every search field stays consistent. Matches against:
  //   • title, folderName, folderId, categoryName, categoryId, projectId
  //   • labels[], tags[]
  //   • raw.excerpt / raw.snippet / raw.preview / raw.description / raw.summary
  //     (defensive — different archive ops use different keys; whichever is
  //     present gets searched)
  function rowMatchesSearch(r, needle) {
    if (!needle) return true;
    const q = String(needle || '').trim().toLowerCase();
    if (!q) return true;
    if (String(r.title || '').toLowerCase().includes(q)) return true;
    if (String(r.folderName || '').toLowerCase().includes(q)) return true;
    if (String(r.folderId || '').toLowerCase().includes(q)) return true;
    if (String(r.categoryName || '').toLowerCase().includes(q)) return true;
    if (String(r.categoryId || '').toLowerCase().includes(q)) return true;
    if (String(r.projectId || '').toLowerCase().includes(q)) return true;
    if ((r.tags || []).some((t) => String(t).toLowerCase().includes(q))) return true;
    if ((r.labels || []).some((l) => String(l).toLowerCase().includes(q))) return true;
    const raw = r.raw || {};
    const excerpt = String(raw.excerpt || raw.snippet || raw.preview || raw.description || raw.summary || '').toLowerCase();
    if (excerpt && excerpt.includes(q)) return true;
    return false;
  }

  // `opts.forceView` is set by the Saved / Pinned / Archive page tabs so the
  // route locks the view filter (the user can no longer accidentally diverge
  // chip selection from tab selection).
  function filterRowsForExplorer(rows, opts = {}) {
    const v = String(opts.forceView || prefs.view || 'saved').toLowerCase();
    let list = rows.filter((r) => r.view === v);

    // Dropdown-driven filters. Empty string in prefs = "All <thing>" (no filter).
    if (prefs.folderFilter)   list = list.filter((r) => String(r.folderId || '') === prefs.folderFilter);
    if (prefs.categoryFilter) list = list.filter((r) => String(r.categoryId || '') === prefs.categoryFilter);
    if (prefs.projectFilter)  list = list.filter((r) => String(r.projectId || '') === prefs.projectFilter);
    if (prefs.labelFilter)    list = list.filter((r) => (r.labels || []).includes(prefs.labelFilter));
    if (prefs.tagFilter)      list = list.filter((r) => (r.tags || []).includes(prefs.tagFilter));

    const q = String(prefs.search || '').trim().toLowerCase();
    if (q) list = list.filter((r) => rowMatchesSearch(r, q));
    return sortRows(list);
  }

  // True when any dropdown filter is currently active. Used to enable the
  // Reset button and to label the chat-list summary.
  function hasActiveFilters() {
    return !!(prefs.folderFilter || prefs.categoryFilter || prefs.labelFilter
           || prefs.tagFilter || prefs.projectFilter);
  }
  function resetExplorerFilters() {
    prefs.folderFilter = '';
    prefs.categoryFilter = '';
    prefs.labelFilter = '';
    prefs.tagFilter = '';
    prefs.projectFilter = '';
    savePrefs(prefs);
  }

  // ── Renderers ──────────────────────────────────────────────────────────────
  function renderDashboard(idx) {
    const rows = idx.getAll();
    const counts = idx.counts();
    const series = buildActivitySeries(rows, 30);
    const recent = rows.slice().sort((a, b) => asTs(b.updatedAt || b.capturedAt) - asTs(a.updatedAt || a.capturedAt)).slice(0, 6);

    const total = counts.total;
    const saved = counts.views?.saved || 0;
    const pinned = counts.views?.pinned || 0;
    const archive = counts.views?.archive || 0;
    // Linked-only records flow in from S0F1c via the Chat Registry source
    // with view='linked'. Surface them as a first-class count alongside
    // saved/pinned/archive so they have a visible signal on the dashboard.
    const linked = counts.views?.linked || 0;

    const subParts = [
      `${formatNumber(saved)} saved`,
      `${formatNumber(pinned)} pinned`,
      `${formatNumber(archive)} archived`,
    ];
    if (linked > 0) subParts.push(`${formatNumber(linked)} linked`);

    const hero = el('section', { class: 'wbDashHero' }, [
      el('div', { class: 'wbDashHeroLeft' }, [
        el('div', { class: 'wbDashHeroLabel' }, 'Library'),
        el('div', { class: 'wbDashHeroValue' }, formatNumber(total)),
        el('div', { class: 'wbDashHeroSub' }, subParts.join(' · ')),
      ]),
      el('div', { class: 'wbDashHeroRight' }, [
        el('div', { class: 'wbDashHeroSparklineLabel' }, 'Activity · last 30 days'),
        Sparkline(series, { width: 280, height: 56 }),
      ]),
    ]);

    const distBars = [
      BarRow({ name: 'Saved',    count: saved,    total, swatch: '#7ab6ff' }),
      BarRow({ name: 'Pinned',   count: pinned,   total, swatch: '#f3c969' }),
      BarRow({ name: 'Archive',  count: archive,  total, swatch: '#a78bfa' }),
    ];
    if (linked > 0) {
      // Make the Linked bar a clickable link into Explorer with the Linked
      // pill pre-selected. Persists prefs.view='linked' first so the
      // Explorer renderer picks it up on the next render() pass.
      const linkedBar = BarRow({ name: 'Linked', count: linked, total, swatch: '#7dd3fc' });
      const linkedAnchor = el('a', {
        class: 'wbBarRowLink',
        href: '#/library/explorer',
        'aria-label': `View ${linked} linked chats`,
      }, [linkedBar]);
      linkedAnchor.addEventListener('click', (ev) => {
        // Programmatic prefs flip — the hash change handles the route, but
        // the view-pill state needs to land before render() fires.
        try { prefs.view = 'linked'; savePrefs(prefs); } catch {}
      });
      distBars.push(linkedAnchor);
    }

    const dist = el('section', { class: 'wbDashDist' }, [
      el('header', { class: 'wbDashSectionHead' }, [el('h3', {}, 'Distribution')]),
      el('div', { class: 'wbDashDistBars' }, distBars),
    ]);

    const topFolders    = topN(idx.facets().byFolder, 6);
    const topCategories = topN(idx.facets().byCategory, 6);
    const topLabels     = topN(idx.facets().byLabel, 6);

    const facetBlock = (titleStr, entries, kind) => {
      const items = entries.length
        ? entries.map(([id, count]) => el('a', {
            class: 'wbDashFacetItem',
            // The route still carries the canonical ID — only the visible name
            // is humanised via labelFor().
            href: getRouteSvc()?.buildLibraryHash?.(kind, id) || '#/library/explorer',
            title: id,
          }, [
            el('span', { class: 'wbDashFacetName' }, labelFor(kind, id, idx)),
            el('span', { class: 'wbDashFacetCount' }, formatNumber(count)),
          ]))
        : [el('div', { class: 'wbDashFacetEmpty' }, `No ${String(titleStr || '').toLowerCase().replace(/^top\s+/, '')} yet`)];
      return el('section', { class: 'wbDashFacet' }, [
        el('header', { class: 'wbDashSectionHead' }, [
          el('h3', {}, titleStr),
          el('a', { class: 'wbDashSectionMore', href: '#/library/explorer' }, 'See all →'),
        ]),
        el('div', { class: 'wbDashFacetList' }, items),
      ]);
    };

    const facetGrid = el('div', { class: 'wbDashFacetGrid' }, [
      facetBlock('Top folders',    topFolders,    'folder'),
      facetBlock('Top categories', topCategories, 'category'),
      facetBlock('Top labels',     topLabels,     'label'),
    ]);

    const recentBlock = el('section', { class: 'wbDashRecent' }, [
      el('header', { class: 'wbDashSectionHead' }, [
        el('h3', {}, 'Recent chats'),
        el('a', { class: 'wbDashSectionMore', href: '#/library/explorer' }, 'Open Explorer →'),
      ]),
      el('div', { class: 'wbDashRecentList' }, recent.length
        ? recent.map((r, i) => ChatRow(r, i))
        : [el('div', { class: 'wbDashRecentEmpty' }, 'No chats captured yet. Use the archive tools on chatgpt.com to capture a conversation.')]),
    ]);

    return el('div', { class: 'wbDashBody' }, [hero, dist, facetGrid, recentBlock]);
  }

  // ── Explorer rich helpers ─────────────────────────────────────────────────
  // These render the native-screenshot-style elements (hero card, stat cards,
  // toolbar, dropdown grid) that distinguish the dedicated Explorer tab from
  // the simpler Saved/Pinned/Archive views.

  function renderExplorerHero(filteredCount, totalCount) {
    return el('section', { class: 'wbExpHero' }, [
      el('div', { class: 'wbExpHeroLabel' }, 'Library Explorer'),
      el('h2', { class: 'wbExpHeroTitle' }, 'Browse and classify known chats'),
      el('div', { class: 'wbExpHeroSub' },
        `Showing ${formatNumber(filteredCount)} filtered chats from ${formatNumber(totalCount)} known chats.`),
    ]);
  }

  function renderExplorerStatCards(idx, filteredCount, totalCount) {
    const groupLabel = (() => {
      switch (prefs.groupBy) {
        case 'folder':   return 'Folder';
        case 'category': return 'Category';
        case 'none':     return 'None';
        default:         return 'Date';
      }
    })();
    const cards = [
      { label: 'Shown',  val: filteredCount, hint: 'after current filters' },
      { label: 'Known',  val: totalCount,    hint: 'stored in Library registry' },
      { label: 'Group',  val: groupLabel,    hint: 'list grouping mode' },
      { label: 'Sort',   val: ({ recent: 'Newest', oldest: 'Oldest', az: 'A → Z', mostTurns: 'Most turns' })[prefs.sort] || 'Newest', hint: 'list ordering' },
    ];
    return el('section', { class: 'wbExpStatRow' }, cards.map((c) => el('div', { class: 'wbExpStatCard' }, [
      el('div', { class: 'wbExpStatLabel' }, c.label),
      el('div', { class: 'wbExpStatValue' }, String(c.val)),
      el('div', { class: 'wbExpStatHint' }, c.hint),
    ])));
  }

  function renderExplorerToolbar(idx) {
    const active = hasActiveFilters();
    const resetBtn = el('button', {
      type: 'button',
      class: `wbExpToolbarBtn${active ? ' is-armed' : ''}`,
      'aria-label': 'Reset all dropdown filters',
    }, 'Reset filters');
    if (!active) resetBtn.disabled = true;
    resetBtn.addEventListener('click', () => { resetExplorerFilters(); render(); });

    const refreshBtn = el('button', {
      type: 'button',
      class: 'wbExpToolbarBtn',
      'aria-label': 'Refresh Library Index from archive',
    }, 'Refresh index');
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.classList.add('is-spinning');
      try {
        await idx.refresh('explorer.toolbar');
        await refreshPageData();
      } catch (e) { err('explorer.refresh', e); }
      finally {
        refreshBtn.classList.remove('is-spinning');
        render();
      }
    });

    const filterCount = [
      prefs.folderFilter, prefs.categoryFilter, prefs.labelFilter,
      prefs.tagFilter, prefs.projectFilter,
    ].filter(Boolean).length;

    return el('div', { class: 'wbExpToolbar' }, [
      el('div', { class: 'wbExpToolbarLeft' }, [
        el('span', { class: `wbExpToolbarChip${filterCount ? ' is-active' : ''}` }, [
          el('span', {}, 'Filters'),
          el('span', { class: 'wbExpToolbarChipCount' }, formatNumber(filterCount)),
        ]),
        el('span', { class: 'wbExpToolbarChip' }, 'Dropdown grid'),
      ]),
      el('div', { class: 'wbExpToolbarRight' }, [resetBtn, refreshBtn]),
    ]);
  }

  function buildOption(value, label, selected) {
    const opt = el('option', { value: String(value) }, String(label));
    if (selected) opt.selected = true;
    return opt;
  }

  function renderExplorerDropdownGrid(idx) {
    const facets = idx.facets();
    const tagFacet     = facets.byTag     || {};
    const projectFacet = facets.byProject || {};

    // Build options: ['', 'All <thing> (N)'] + entries from cached catalog / facet.
    const folderOpts = [
      buildOption('', `All folders (${formatNumber(pageData.folders.length)})`, !prefs.folderFilter),
      ...pageData.folders.map((f) => {
        const v = String(f.id || f.folderId || '');
        const l = String(f.name || f.label || f.folderName || v);
        return v ? buildOption(v, l, v === prefs.folderFilter) : null;
      }).filter(Boolean),
    ];
    const categoryOpts = [
      buildOption('', `All categories (${formatNumber(pageData.categories.length)})`, !prefs.categoryFilter),
      ...pageData.categories.map((c) => {
        const v = String(c.id || c.categoryId || '');
        const l = String(c.name || c.label || c.categoryName || v);
        return v ? buildOption(v, l, v === prefs.categoryFilter) : null;
      }).filter(Boolean),
    ];
    const labelOpts = [
      buildOption('', `All labels (${formatNumber(pageData.labels.length)})`, !prefs.labelFilter),
      ...pageData.labels.map((lb) => {
        const v = String(lb.id || lb.labelId || lb.name || '');
        const l = String(lb.name || lb.label || v);
        return v ? buildOption(v, l, v === prefs.labelFilter) : null;
      }).filter(Boolean),
    ];
    const tagOpts = [
      buildOption('', `All tags (${formatNumber(Object.keys(tagFacet).length)})`, !prefs.tagFilter),
      ...Object.entries(tagFacet)
        .map(([t, ids]) => [t, Array.isArray(ids) ? ids.length : 0])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 64)
        .map(([t, n]) => buildOption(t, `${t} (${formatNumber(n)})`, t === prefs.tagFilter)),
    ];
    const projectOpts = [
      buildOption('', `All projects (${formatNumber(Object.keys(projectFacet).length)})`, !prefs.projectFilter),
      ...Object.entries(projectFacet)
        .map(([p, ids]) => [p, Array.isArray(ids) ? ids.length : 0])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 64)
        .map(([p, n]) => buildOption(p, `${p} (${formatNumber(n)})`, p === prefs.projectFilter)),
    ];
    const sortOpts = [
      buildOption('recent',    'Newest first',         prefs.sort === 'recent'),
      buildOption('oldest',    'Oldest first',         prefs.sort === 'oldest'),
      buildOption('az',        'A → Z by title',       prefs.sort === 'az'),
      buildOption('mostTurns', 'Most turns first',     prefs.sort === 'mostTurns'),
    ];

    const dropdown = (label, prefKey, options) => {
      const select = el('select', { class: 'wbExpDropdown', 'aria-label': label }, options);
      select.addEventListener('change', (ev) => {
        prefs[prefKey] = String(ev.target.value || '');
        savePrefs(prefs);
        render();
      });
      return el('label', { class: 'wbExpDropdownGroup' }, [
        el('span', { class: 'wbExpDropdownLabel' }, label),
        select,
      ]);
    };

    return el('div', { class: 'wbExpDropdownGrid' }, [
      dropdown('Folder',   'folderFilter',   folderOpts),
      dropdown('Category', 'categoryFilter', categoryOpts),
      dropdown('Label',    'labelFilter',    labelOpts),
      dropdown('Tag',      'tagFilter',      tagOpts),
      dropdown('Project',  'projectFilter',  projectOpts),
      dropdown('Sort',     'sort',           sortOpts),
    ]);
  }

  function renderExplorer(idx, opts = {}) {
    const rows = idx.getAll();
    const filtered = filterRowsForExplorer(rows, opts);
    const grouped = groupRows(filtered);
    const activeView = String(opts.forceView || prefs.view || 'saved').toLowerCase();
    // "Rich" mode = dedicated Explorer tab. The Saved / Pinned / Archive tabs
    // (forceView set) keep the simpler chip-only layout.
    const rich = !opts.forceView;
    // Linked count drives whether the Linked pill renders. Saved/Pinned/
    // Archive tabs (forceView set) keep `hideViewChips:true` so they never
    // show a Linked pill — the Saved tab must remain saved-transcript-only.
    const linkedCount = (idx.counts?.()?.views?.linked) || 0;

    // The page-level shell renders a unified search input above the tab nav,
    // so we hide the internal Explorer SearchBar to avoid a duplicate field.
    const head = el('section', { class: 'wbExpHead' }, [
      rich ? renderExplorerHero(filtered.length, rows.length) : null,
      rich ? renderExplorerStatCards(idx, filtered.length, rows.length) : null,
      rich ? renderExplorerToolbar(idx) : null,
      rich ? renderExplorerDropdownGrid(idx) : null,
      opts.hideInternalSearch ? null : SearchBar(),
      FilterChips({ hideViewChips: !!opts.forceView, hideSortChips: rich, linkedCount }),
      el('div', { class: 'wbExpSummary' },
        `${formatNumber(filtered.length)} of ${formatNumber(rows.length)} chats${
          rich && hasActiveFilters() ? ` · ${[
            prefs.folderFilter, prefs.categoryFilter, prefs.labelFilter,
            prefs.tagFilter, prefs.projectFilter,
          ].filter(Boolean).length} filter(s) active` : ''
        }`),
    ]);

    const body = el('section', { class: 'wbExpBody' });
    if (grouped.length === 0 || grouped.every((g) => g.rows.length === 0)) {
      body.appendChild(el('div', { class: 'wbExpEmpty' }, [
        el('div', { class: 'wbExpEmptyTitle' }, 'No chats match'),
        el('div', { class: 'wbExpEmptySub' }, prefs.search
          ? `Nothing matches "${prefs.search}" in the ${activeView} view.`
          : `Nothing in the ${activeView} view yet.`),
      ]));
    } else {
      for (const group of grouped) {
        if (group.rows.length === 0) continue;
        body.appendChild(el('div', { class: 'wbExpGroup' }, [
          group.label ? el('header', { class: 'wbExpGroupHead' }, [
            el('span', { class: 'wbExpGroupLabel' }, group.label),
            el('span', { class: 'wbExpGroupCount' }, formatNumber(group.rows.length)),
          ]) : null,
          el('div', { class: 'wbExpGroupRows' }, group.rows.slice(0, 200).map((r, i) => ChatRow(r, i))),
        ]));
      }
    }
    return el('div', { class: 'wbExpBodyWrap' }, [head, body]);
  }

  function renderAnalytics(idx) {
    const counts = idx.counts();
    const f = idx.facets();
    const total = counts.total;

    // Map raw facet name → kind so the section helper knows whether to humanise
    // the bar labels and which catalog to consult. Caller passes the kind.
    function section(titleStr, facetMap, swatchSeed, kind) {
      const entries = Object.entries(facetMap || {})
        .map(([k, v]) => [k, Array.isArray(v) ? v.length : Number(v) || 0])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12);
      const palette = ['#7ab6ff','#a78bfa','#f3c969','#6ad28a','#fca5a5','#22d3ee','#fb923c','#f472b6','#94a3b8','#facc15','#34d399','#c084fc'];
      return el('section', { class: 'wbAnaSection' }, [
        el('header', { class: 'wbAnaSectionHead' }, [
          el('h3', {}, titleStr),
          el('span', { class: 'wbAnaSectionMeta' }, `${formatNumber(entries.length)} of ${formatNumber(Object.keys(facetMap || {}).length)}`),
        ]),
        entries.length ? el('div', { class: 'wbAnaBars' }, entries.map(([id, count], i) =>
          BarRow({ name: labelFor(kind, id, idx), count, total, swatch: palette[(swatchSeed + i) % palette.length] })
        )) : el('div', { class: 'wbAnaEmpty' }, `No ${String(titleStr || '').toLowerCase()} yet — capture some chats to populate this chart.`),
      ]);
    }

    const tagEntries = Object.entries(f.byTag || {})
      .map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 32);
    const maxTag = tagEntries[0]?.[1] || 1;
    const tagCloud = el('section', { class: 'wbAnaSection wbAnaSection--cloud' }, [
      el('header', { class: 'wbAnaSectionHead' }, [el('h3', {}, 'Top tags')]),
      tagEntries.length
        ? el('div', { class: 'wbAnaCloud' }, tagEntries.map(([name, count]) => {
            const weight = 0.5 + 0.5 * (count / maxTag);
            return el('a', {
              class: 'wbAnaCloudItem',
              href: getRouteSvc()?.buildLibraryHash?.('tag', name) || '#/library/explorer',
              style: `font-size:${(11 + weight * 7).toFixed(2)}px; opacity:${(0.65 + weight * 0.35).toFixed(2)}`,
            }, [`#${name}`, el('span', { class: 'wbAnaCloudCount' }, formatNumber(count))]);
          }))
        : el('div', { class: 'wbAnaEmpty' }, 'No tags yet'),
    ]);

    return el('div', { class: 'wbAnaBody' }, [
      section('Folders',    f.byFolder,    0, 'folder'),
      section('Categories', f.byCategory,  3, 'category'),
      section('Labels',     f.byLabel,     6, 'label'),
      tagCloud,
      section('Projects',   f.byProject,   9, 'project'),
    ]);
  }

  function renderDetail(idx, kind, id) {
    const filterKey = kind === 'tag' ? 'tag' : (kind === 'label' ? 'label' : (kind === 'category' ? 'categoryId' : 'folderId'));
    const decoded = (() => { try { return decodeURIComponent(id); } catch { return id; } })();
    const filter = { [filterKey]: decoded };
    const rows = sortRows(idx.query(filter));

    const backHref = '#/library/explorer';
    const grouped = groupRows(rows);

    // Show the human name in the title; expose the raw id in the tooltip
    // for power users who want to copy/paste it.
    const humanName = labelFor(kind, decoded, idx) || decoded;
    const head = el('section', { class: 'wbDetailHead' }, [
      el('a', { class: 'wbDetailBack', href: backHref }, '← Back to Explorer'),
      el('div', { class: 'wbDetailEyebrow' }, kind),
      el('h2', { class: 'wbDetailTitle', title: decoded }, humanName),
      el('div', { class: 'wbDetailMeta' }, `${formatNumber(rows.length)} ${rows.length === 1 ? 'chat' : 'chats'}`),
    ]);
    const body = el('section', { class: 'wbDetailBody' });
    if (!rows.length) body.appendChild(el('div', { class: 'wbExpEmpty' }, 'No chats here yet.'));
    else for (const group of grouped) {
      body.appendChild(el('div', { class: 'wbExpGroup' }, [
        group.label ? el('header', { class: 'wbExpGroupHead' }, [
          el('span', { class: 'wbExpGroupLabel' }, group.label),
          el('span', { class: 'wbExpGroupCount' }, formatNumber(group.rows.length)),
        ]) : null,
        el('div', { class: 'wbExpGroupRows' }, group.rows.map((r, i) => ChatRow(r, i))),
      ]));
    }
    return el('div', { class: 'wbDetailBodyWrap' }, [head, body]);
  }

  // ── Mount / dispatch ───────────────────────────────────────────────────────
  // Tab catalog — declared once so the dispatch and the rendered tab nav can't
  // drift apart. Order matches the native ChatGPT Library page layout.
  const LIBRARY_TABS = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'explorer',  label: 'Explorer' },
    { key: 'recents',   label: 'Recents' },
    { key: 'saved',     label: 'Saved' },
    { key: 'organize',  label: 'Organize' },
  ];

  // Page-data cache: folders/labels/categories counts shown in the header stats
  // line. The Library Workspace already caches these for ~30s; we copy the
  // resolved values into a sync-readable slot so the header can render without
  // awaiting on every paint.
  const pageData = {
    folders: [],
    labels: [],
    categories: [],
  };

  // In-flight dedup so multiple subscribers calling refreshPageData concurrently
  // (Workspace subscriber + cross-surface-sync subscriber + show()) coalesce
  // into one Promise → at most one fetch trio per microtask burst.
  let pageDataInFlight = null;
  async function refreshPageData() {
    if (pageDataInFlight) return pageDataInFlight;
    const ws = getWorkspace();
    if (!ws) return;
    pageDataInFlight = (async () => {
      try {
        const [folders, labels, categories] = await Promise.all([
          ws.getFolders().catch(() => []),
          ws.getLabels().catch(() => []),
          ws.getCategories().catch(() => []),
        ]);
        pageData.folders    = Array.isArray(folders)    ? folders    : [];
        pageData.labels     = Array.isArray(labels)     ? labels     : [];
        pageData.categories = Array.isArray(categories) ? categories : [];
        step('pageData.refreshed', `${pageData.folders.length}/${pageData.labels.length}/${pageData.categories.length}`);
      } catch (e) { err('refreshPageData', e); }
    })();
    try { return await pageDataInFlight; }
    finally { pageDataInFlight = null; }
  }

  // ── Page-shell renderers (header / search / secondary nav / tabs) ──────────
  function renderPageHeader(idx) {
    const counts = idx.counts();
    const savedCount   = counts.views?.saved || 0;
    const folderCount  = pageData.folders.length;
    const labelCount   = pageData.labels.length;
    const catCount     = pageData.categories.length;
    const projectCount = Object.keys(idx.facets().byProject || {}).length;
    const statsLine = `${formatNumber(savedCount)} saved chats · ${formatNumber(folderCount)} folders · ${formatNumber(labelCount)} labels · ${formatNumber(catCount)} categories · ${formatNumber(projectCount)} projects`;

    const refreshBtn = el('button', {
      type: 'button',
      class: 'wbLibraryPageRefreshBtn',
      'aria-label': 'Refresh Library',
      title: 'Refresh Library',
      html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3.5-7.1"/><path d="M21 4v5h-5"/></svg>',
    });
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.classList.add('is-spinning');
      try {
        await idx.refresh('page-header.refresh');
        await refreshPageData();
        render();
      } catch (e) { err('header-refresh', e); }
      finally { setTimeout(() => refreshBtn.classList.remove('is-spinning'), 400); }
    });

    return el('header', { class: 'wbLibraryPageHeader' }, [
      el('div', { class: 'wbLibraryPageBrand' }, [
        el('span', { class: 'wbLibraryPageBrandIcon', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h6v14H4z"/><path d="M14 4h6v16h-6z"/><path d="M4 9h6"/><path d="M14 8h6"/></svg>' }),
        el('div', { class: 'wbLibraryPageBrandText' }, [
          el('h1', { class: 'wbLibraryPageTitle' }, 'Library'),
          el('div', { class: 'wbLibraryPageStats' }, statsLine),
        ]),
      ]),
      el('div', { class: 'wbLibraryPageActions' }, [refreshBtn]),
    ]);
  }

  function renderPageSearchRow() {
    const searchInput = el('input', {
      type: 'search',
      class: 'wbLibraryPageSearchInput',
      placeholder: 'Search chats, folders, labels, categories, projects…',
      value: prefs.search || '',
      autocomplete: 'off',
      spellcheck: 'false',
    });
    searchInput.addEventListener('input', (ev) => {
      prefs.search = String(ev.target.value || '');
      savePrefs(prefs);
      if (state._searchTimer) clearTimeout(state._searchTimer);
      state._searchTimer = setTimeout(() => render(), 140);
    });

    const clearBtn = prefs.search ? el('button', {
      type: 'button',
      class: 'wbLibraryPageSearchClear',
      'aria-label': 'Clear search',
    }, '×') : null;
    if (clearBtn) clearBtn.addEventListener('click', () => {
      prefs.search = '';
      savePrefs(prefs);
      render();
    });

    const search = el('label', { class: 'wbLibraryPageSearch' }, [
      el('span', { class: 'wbLibraryPageSearchIcon', html: '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><circle cx="11" cy="11" r="5.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m15.1 15.1 3.15 3.15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' }),
      searchInput,
      clearBtn,
    ]);

    // Secondary nav: clicking a facet sets groupBy and switches to Explorer.
    const onFacet = (groupBy) => () => {
      prefs.groupBy = groupBy;
      savePrefs(prefs);
      W.location.hash = '#/library/explorer';
    };

    const secondaryNav = el('nav', { class: 'wbLibraryPageSecondaryNav', 'aria-label': 'Group library by' }, [
      ['Folders',    'folder'],
      ['Labels',     'label'],
      ['Categories', 'category'],
      ['Projects',   'project'],
    ].map(([label, gb]) => {
      const b = el('button', { type: 'button', class: 'wbLibraryPageSecondaryItem' }, label);
      b.addEventListener('click', onFacet(gb));
      return b;
    }));

    return el('div', { class: 'wbLibraryPageSearchRow' }, [search, secondaryNav]);
  }

  function renderPageTabs(view) {
    return el('nav', { class: 'wbLibraryPageTabs', 'aria-label': 'Library views' },
      LIBRARY_TABS.map((t) => el('a', {
        class: `wbLibraryPageTab${view === t.key ? ' is-active' : ''}`,
        href: `#/library/${t.key}`,
      }, t.label))
    );
  }

  function renderRecents(idx) {
    // Recents is defined as "newest first" regardless of prefs.sort, so we
    // sort inline by updatedAt / capturedAt and hide the Sort chip group on
    // this tab. View chips are hidden too — Recents spans all views.
    const all = idx.getAll();
    const sorted = all.slice().sort((a, b) => asTs(b.updatedAt || b.capturedAt) - asTs(a.updatedAt || a.capturedAt));
    const q = String(prefs.search || '').trim().toLowerCase();
    const filtered = q ? sorted.filter((r) => rowMatchesSearch(r, q)) : sorted;
    const grouped = groupRows(filtered);

    const body = el('section', { class: 'wbExpBody' });
    if (filtered.length === 0) {
      body.appendChild(el('div', { class: 'wbExpEmpty' }, [
        el('div', { class: 'wbExpEmptyTitle' }, 'No chats yet'),
        el('div', { class: 'wbExpEmptySub' }, 'Capture a chat from chatgpt.com to start populating your Library.'),
      ]));
    } else {
      for (const group of grouped) {
        if (group.rows.length === 0) continue;
        body.appendChild(el('div', { class: 'wbExpGroup' }, [
          group.label ? el('header', { class: 'wbExpGroupHead' }, [
            el('span', { class: 'wbExpGroupLabel' }, group.label),
            el('span', { class: 'wbExpGroupCount' }, formatNumber(group.rows.length)),
          ]) : null,
          el('div', { class: 'wbExpGroupRows' }, group.rows.slice(0, 200).map((r, i) => ChatRow(r, i))),
        ]));
      }
    }
    return el('div', { class: 'wbExpBodyWrap' }, [
      el('section', { class: 'wbExpHead' }, [
        // Recents is deliberately a "global" view — no view filter applies and
        // the sort is locked to newest-first inside the renderer. Hide both
        // View and Sort chip groups; keep Group-by chips so the user can still
        // slice the recent stream by folder/category/label/project/date.
        FilterChips({ hideViewChips: true, hideSortChips: true }),
        el('div', { class: 'wbExpSummary' }, `${formatNumber(filtered.length)} of ${formatNumber(all.length)} chats · all views`),
      ]),
      body,
    ]);
  }

  // ── Organize tab: multi-select + batch mutations ──────────────────────────
  // Selection state survives tab switches inside the Library page so the user
  // can build a selection across Saved/Explorer and finalize on Organize.
  // Pruning happens on data refresh: chats that no longer exist drop out.
  const organize = {
    selected: new Set(),
    pending: { folderId: '', categoryId: '' },
    busy: false,
  };

  function clearOrganizeSelection() {
    organize.selected.clear();
    organize.pending = { folderId: '', categoryId: '' };
  }

  function renderOrganize(idx) {
    const all = idx.getAll();
    // Prune stale selections against the full data set (not the filtered one)
    // so search/filter changes don't quietly destroy user intent.
    const allChatIds = new Set(all.map((r) => r.chatId));
    for (const id of Array.from(organize.selected)) {
      if (!allChatIds.has(id)) organize.selected.delete(id);
    }

    const sorted = sortRows(all);
    const q = String(prefs.search || '').trim().toLowerCase();
    const filtered = q ? sorted.filter((r) => rowMatchesSearch(r, q)) : sorted;
    // Cap visible rows for performance; selection state isn't bounded by this.
    const visible = filtered.slice(0, 200);
    const selectedCount = organize.selected.size;

    // ── Bulk action bar ──────────────────────────────────────────────────────
    const folderOpts = [
      { value: '', label: '— Folder: leave unchanged —' },
      { value: '__none__', label: 'Move to Unfiled' },
      ...pageData.folders.map((f) => ({
        value: String(f.id || f.folderId || ''),
        label: String(f.name || f.label || f.folderName || f.id || ''),
      })).filter((o) => o.value && o.label),
    ];
    const categoryOpts = [
      { value: '', label: '— Category: leave unchanged —' },
      { value: '__none__', label: 'Clear category' },
      ...pageData.categories.map((c) => ({
        value: String(c.id || c.categoryId || ''),
        label: String(c.name || c.label || c.categoryName || c.id || ''),
      })).filter((o) => o.value && o.label),
    ];

    const folderSelect = el('select', { class: 'wbOrganizeSelect', 'aria-label': 'Bulk assign folder' },
      folderOpts.map((o) => el('option', { value: o.value }, o.label)));
    folderSelect.value = organize.pending.folderId;
    folderSelect.addEventListener('change', (ev) => {
      organize.pending.folderId = String(ev.target.value || '');
    });

    const categorySelect = el('select', { class: 'wbOrganizeSelect', 'aria-label': 'Bulk assign category' },
      categoryOpts.map((o) => el('option', { value: o.value }, o.label)));
    categorySelect.value = organize.pending.categoryId;
    categorySelect.addEventListener('change', (ev) => {
      organize.pending.categoryId = String(ev.target.value || '');
    });

    const canApply = !organize.busy
      && selectedCount > 0
      && (organize.pending.folderId || organize.pending.categoryId);
    const applyBtn = el('button', {
      type: 'button',
      class: 'wbOrganizeApply',
    }, organize.busy ? 'Applying…' : 'Apply to selected');
    if (!canApply) applyBtn.disabled = true;
    applyBtn.addEventListener('click', async () => {
      if (organize.busy || selectedCount === 0) return;
      const fId = organize.pending.folderId;
      const cId = organize.pending.categoryId;
      if (!fId && !cId) return;

      const ws = getWorkspace();
      if (!ws) { err('organize.apply', 'no workspace'); return; }

      organize.busy = true;
      render();

      try {
        const chatIds = Array.from(organize.selected);
        // Resolve snapshotId for category mutations from the cached row data.
        const rowByChatId = new Map(all.map((r) => [r.chatId, r]));
        const tasks = [];
        if (fId) {
          const target = fId === '__none__' ? '' : fId;
          for (const id of chatIds) {
            tasks.push(ws.setFolderBinding(id, target).catch((e) => err('apply.folder', e)));
          }
        }
        if (cId) {
          const target = cId === '__none__' ? '' : cId;
          for (const id of chatIds) {
            const row = rowByChatId.get(id);
            if (row?.snapshotId) {
              tasks.push(ws.setSnapshotCategory(row.snapshotId, id, target).catch((e) => err('apply.category', e)));
            }
          }
        }
        await Promise.allSettled(tasks);
        clearOrganizeSelection();
        // refreshPageData() refills folder/label/category catalogs after the
        // mutation; the Index refresh is already chained inside Workspace.
        await refreshPageData();
        step('organize.apply', `n=${chatIds.length}`);
      } catch (e) {
        err('organize.apply', e);
      } finally {
        organize.busy = false;
        render();
      }
    });

    const clearBtn = el('button', { type: 'button', class: 'wbOrganizeClear' }, 'Clear selection');
    if (selectedCount === 0 || organize.busy) clearBtn.disabled = true;
    clearBtn.addEventListener('click', () => { clearOrganizeSelection(); render(); });

    const bulkBar = el('div', {
      class: `wbOrganizeBulk${selectedCount > 0 ? ' is-active' : ''}${organize.busy ? ' is-busy' : ''}`,
    }, [
      el('div', { class: 'wbOrganizeBulkCount' }, [
        el('strong', {}, formatNumber(selectedCount)),
        el('span', {}, selectedCount === 1 ? ' chat selected' : ' chats selected'),
      ]),
      el('div', { class: 'wbOrganizeBulkControls' }, [
        el('label', { class: 'wbOrganizeBulkLabel' }, [el('span', {}, 'Folder'), folderSelect]),
        el('label', { class: 'wbOrganizeBulkLabel' }, [el('span', {}, 'Category'), categorySelect]),
        applyBtn,
        clearBtn,
      ]),
    ]);

    // ── Select-all + summary row ─────────────────────────────────────────────
    const allVisibleSelected = visible.length > 0 && visible.every((r) => organize.selected.has(r.chatId));
    const selectAllInput = el('input', {
      type: 'checkbox',
      class: 'wbOrganizeCheck',
      'aria-label': 'Select all visible chats',
      checked: allVisibleSelected ? 'checked' : null,
    });
    selectAllInput.addEventListener('change', () => {
      if (selectAllInput.checked) for (const r of visible) organize.selected.add(r.chatId);
      else for (const r of visible) organize.selected.delete(r.chatId);
      render();
    });
    const selectAllRow = el('div', { class: 'wbOrganizeSelectAll' }, [
      el('label', { class: 'wbOrganizeCheckLabel' }, [
        selectAllInput,
        el('span', {}, `Select all visible (${formatNumber(visible.length)})`),
      ]),
      el('span', { class: 'wbOrganizeSummary' },
        `${formatNumber(filtered.length)} of ${formatNumber(all.length)} chats`),
    ]);

    // ── Selectable rows ──────────────────────────────────────────────────────
    const list = el('div', { class: 'wbOrganizeList' });
    if (visible.length === 0) {
      list.appendChild(el('div', { class: 'wbExpEmpty' }, [
        el('div', { class: 'wbExpEmptyTitle' }, 'Nothing to organize'),
        el('div', { class: 'wbExpEmptySub' }, q
          ? `No chats matching "${prefs.search}"`
          : 'Capture a chat from chatgpt.com to start populating your Library.'),
      ]));
    } else {
      for (const row of visible) {
        const checked = organize.selected.has(row.chatId);
        const cb = el('input', {
          type: 'checkbox',
          class: 'wbOrganizeRowCheck',
          'aria-label': `Select ${row.title || row.chatId}`,
          checked: checked ? 'checked' : null,
        });
        const folderTxt = row.folderName ? `📁 ${row.folderName}` : '— Unfiled —';
        const catTxt = row.categoryName ? `◆ ${row.categoryName}` : '— Uncategorized —';
        const ts = asTs(row.updatedAt || row.capturedAt);
        const dateTxt = ts ? formatDateShort(ts) : '';
        const item = el('label', {
          class: `wbOrganizeRow${checked ? ' is-selected' : ''}`,
        }, [
          cb,
          el('div', { class: 'wbOrganizeRowMain' }, [
            el('div', { class: 'wbOrganizeRowTitle' }, row.title || row.chatId || 'Untitled chat'),
            el('div', { class: 'wbOrganizeRowMeta' },
              [folderTxt, catTxt, dateTxt].filter(Boolean).join(' · ')),
          ]),
        ]);
        cb.addEventListener('change', () => {
          if (cb.checked) organize.selected.add(row.chatId);
          else organize.selected.delete(row.chatId);
          render();
        });
        list.appendChild(item);
      }
    }

    return el('div', { class: 'wbOrganizeBody' }, [bulkBar, selectAllRow, list]);
  }

  function renderLibraryShell(view, idx) {
    let bodyContent;
    if (view === 'explorer')        bodyContent = renderExplorer(idx, { hideInternalSearch: true });
    else if (view === 'analytics')   bodyContent = renderAnalytics(idx);
    else if (view === 'recents')     bodyContent = renderRecents(idx);
    else if (view === 'organize')    bodyContent = renderOrganize(idx);
    else if (view === 'saved' || view === 'pinned' || view === 'archive') {
      bodyContent = renderExplorer(idx, { forceView: view, hideInternalSearch: true });
    }
    else if (['folder','category','label','tag'].includes(view) && state.lastRoute?.id) {
      bodyContent = renderDetail(idx, view, state.lastRoute.id);
    }
    else                             bodyContent = renderDashboard(idx);

    return el('div', { class: 'wbLibraryPage' }, [
      renderPageHeader(idx),
      renderPageSearchRow(),
      renderPageTabs(view),
      el('section', { class: 'wbLibraryPageBody' }, bodyContent),
    ]);
  }

  function render() {
    const idx = getIndex();
    if (!idx) { step('render.skip', 'no-index'); return; }
    const pageHost = getPageHost();
    const routeSvc = getRouteSvc();
    if (!pageHost || !routeSvc) { step('render.skip', 'no-services'); return; }
    const region = pageHost.ensureLibraryRegion?.();
    if (!region) { step('render.skip', 'no-region'); return; }

    const route = routeSvc.current?.() || { name: 'library', view: 'dashboard', id: '' };
    state.lastRoute = route;
    const view = route.name === 'library' ? (route.view || 'dashboard') : 'dashboard';
    const token = ++state.renderToken;

    // Capture focus state BEFORE tearing down the DOM so a debounced search-
    // input re-render doesn't yank the caret out of the user's hands. We only
    // care about the page-level Library search box; other inputs aren't
    // affected because they're inside per-tab bodies that the user wouldn't
    // be typing into mid-render-cycle.
    const activeEl = D.activeElement;
    const restoreSearchFocus = !!(activeEl && activeEl.classList && activeEl.classList.contains('wbLibraryPageSearchInput'));
    const savedCaret = restoreSearchFocus
      ? { start: activeEl.selectionStart, end: activeEl.selectionEnd }
      : null;

    const shell = renderLibraryShell(view, idx);

    if (token !== state.renderToken) return;
    region.innerHTML = '';
    region.appendChild(shell);
    state.rootEl = region;

    if (restoreSearchFocus) {
      const newInput = region.querySelector('.wbLibraryPageSearchInput');
      if (newInput) {
        try {
          newInput.focus();
          // setSelectionRange may throw on input types it doesn't apply to.
          const len = String(newInput.value || '').length;
          const s = Math.min(savedCaret?.start ?? len, len);
          const e = Math.min(savedCaret?.end   ?? len, len);
          newInput.setSelectionRange(s, e);
        } catch {}
      }
    }
    step('render.ok', `${view}:${idx.diagnose().rows}`);
  }

  function show() {
    const pageHost = getPageHost();
    if (!pageHost) return;
    pageHost.showLibraryRegion(true);
    state.visible = true;
    render();
    // Refresh folder/label/category counts in the header asynchronously so the
    // stats line populates on first paint. The Workspace facade caches results
    // for ~30s; we re-render when fresh data lands.
    refreshPageData().then(() => { if (state.visible) render(); });
  }
  function hide() {
    const pageHost = getPageHost();
    if (!pageHost) return;
    pageHost.showLibraryRegion(false);
    state.visible = false;
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  const Insights = {
    surface: 'studio',
    show, hide, render,
    prefs: () => ({ ...prefs }),
    setPrefs(patch) { Object.assign(prefs, patch || {}); savePrefs(prefs); render(); },
    diagnose() {
      return {
        surface: 'studio',
        version: '2.0.0',
        visible: state.visible,
        lastRoute: state.lastRoute,
        prefs: { ...prefs },
        hasIndex: !!getIndex(),
        hasPageHost: !!getPageHost(),
        hasUIShell: !!getUIShell(),
        hasRouteSvc: !!getRouteSvc(),
        steps: diag.steps.slice(-20),
        errors: diag.errors.slice(-10),
      };
    },
  };

  H2O.LibraryInsights = Insights;
  H2O.Library.Insights = Insights;

  // ── Subscriptions ──────────────────────────────────────────────────────────
  function bindUpdates() {
    const ws = getWorkspace();
    if (!ws || typeof ws.subscribe !== 'function') return false;
    // The set of Workspace reasons that signal underlying catalog data may
    // have changed (folder/label/category lists, not just bindings). For these
    // we refresh pageData first so Dashboard facet names + Explorer dropdowns
    // pick up fresh names and counts. Route changes etc. just re-render.
    const CATALOG_REASONS = new Set([
      'folder-binding-changed',
      'category-changed',
      'category-reclassified',
      'index-updated',
      'cache-bust',
      'cross-surface-sync',
    ]);
    ws.subscribe((evt) => {
      if (!state.visible) return;
      const reason = String(evt && evt.reason || '');
      if (CATALOG_REASONS.has(reason)) {
        refreshPageData().then(() => { if (state.visible) render(); });
      } else {
        render();
      }
    });
    const routeSvc = getRouteSvc();
    if (routeSvc?.on) routeSvc.on(() => { if (state.visible) render(); });
    // Cross-surface sync (S0F1h) fires its own custom event; mirror the same
    // refresh-then-render path so the Library page updates when a chatgpt.com
    // tab mutates state.
    W.addEventListener('evt:h2o:library:cross-surface-sync', () => {
      if (!state.visible) return;
      refreshPageData().then(() => { if (state.visible) render(); });
    });
    return true;
  }

  function registerOnCore() {
    const core = getCore();
    if (!core || typeof core.registerOwner !== 'function') return false;
    try {
      core.registerOwner('library-insights', Insights, { replace: true });
      core.registerService('library-insights', Insights, { replace: true });
      step('register-on-core', 'library-insights');
      return true;
    } catch (e) { err('register-on-core', e); return false; }
  }

  if (!registerOnCore()) {
    W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => { registerOnCore(); bindUpdates(); }, { once: true });
  } else {
    bindUpdates();
  }

  step('boot', 'studio-library-insights-v2-ready');
})();
