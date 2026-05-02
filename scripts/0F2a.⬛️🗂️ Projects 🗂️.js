// ==UserScript==
// @h2o-id             0f2a.projects
// @name               0F2a.⬛️🗂️ Projects 🗂️
// @namespace          H2O.Premium.CGX.projects
// @author             HumamDev
// @version            1.2.0
// @revision           003
// @build              260424-000001
// @description        Projects: feature-owner module. Native projects cache, fetch, reconcile, viewer, and route. Template for future 0F-pattern feature owners.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /*
   * 0F2a — Projects (feature-owner module)
   *
   * OWNS:     Native projects cache, fetch, reconcile, and viewer. Projects page/route registration.
   *           Projects sidebar native controls, more-page override, fetch intercept hooks.
   * MUST NOT OWN: Shared sidebar row infra (owned by 0F3a), category logic (owned by 0F4a),
   *           folders data (owned by 0F3a), any LibraryCore service definitions.
   * EXPOSES:  H2O.Projects, registers 'projects' owner+service+route in H2O.LibraryCore.
   *
   * STATE COUPLING: STATE and CLEAN are Proxy objects that first read/write H2O.FS.fldrs.state
   *   (the shared fldrs vault owned by 0F3a). This intentionally keeps Projects state in the
   *   shared vault so 0F3a can observe refresh state (e.g. for refresh button). New feature
   *   modules should own their own isolated state and should NOT replicate this proxy pattern.
   *
   * TEMPLATE NOTES FOR FUTURE FEATURE OWNERS (Tags, Labels, Studio, etc.):
   *   - Copy the registerOwner + registerService + registerRoute pattern from this file.
   *   - Consume shared infra by calling core.getService() at use-time (never capture at init).
   *   - Keep all domain logic local; do not leak domain logic into 0F1a or 0F3a.
   *   - Do not register compat seam services unless you own rendering infra used by another module.
   */

  const W = window;
  const D = document;
  const H2O = (W.H2O = W.H2O || {});
  const core = H2O.LibraryCore;
  if (!core) return;

  const MOD = (H2O.Projects = H2O.Projects || {});
  MOD.meta = MOD.meta || {
    owner: '0F2a.projects',
    label: 'Projects',
    phase: 'phase-6-projects-owner-finalized',
  };

  const diag = (MOD.diag = MOD.diag || { t0: performance.now(), steps: [], errors: [], bufMax: 160, errMax: 40 });
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

  const OWNER_SKID = 'flsc';
  const ATTR_CGXUI = 'data-cgxui';
  const ATTR_CGXUI_OWNER = 'data-cgxui-owner';
  const ATTR_CGXUI_STATE = 'data-cgxui-state';
  const ATTR_CGXUI_MODE = 'data-cgxui-mode';
  const ATTR_CGXUI_PAGE_HIDDEN = 'data-cgxui-page-hidden-by';
  const UI_FSECTION_VIEWER = `${OWNER_SKID}-viewer`;
  const UI_FSECTION_PAGE_HOST = `${OWNER_SKID}-page-host`;
  const UI_FSECTION_PAGE = `${OWNER_SKID}-page`;
  const CFG_H2O_PAGE_ROUTE_OWNER = `${OWNER_SKID}:page-route:v1`;
  const CFG_H2O_PAGE_ROUTE_PREFIX = 'h2o';
  const CFG_H2O_PAGE_QUERY_FLAG = `h2o_${OWNER_SKID}`;
  const CFG_H2O_PAGE_QUERY_VIEW = `h2o_${OWNER_SKID}_view`;
  const CFG_H2O_PAGE_QUERY_ID = `h2o_${OWNER_SKID}_id`;

  const KEY_FSECTION_PROJECTS_CACHE_V1 = 'h2o:prm:cgx:fldrs:state:projects_cache:v1';
  const KEY_FSECTION_PROJECTS_NATIVE_HEADERS_V1 = 'h2o:prm:cgx:fldrs:state:projects_native_headers:v1';
  const KEY_FSECTION_STATE_UI_V1 = 'h2o:prm:cgx:fldrs:state:ui:v1';
  const KEY_LEG_UI = 'h2o:folders:ui:v1';

  const CFG_SEE_MORE_LIMIT = 5;
  const CFG_PROJECTS_CACHE_VERSION = 2;
  const CFG_PROJECTS_CACHE_TTL_MS = 60 * 1000;
  const CFG_PROJECTS_FETCH_PAGE_LIMIT = 80;
  const CFG_PROJECTS_AUTH_LIMIT = 20;
  const CFG_PROJECTS_NATIVE_HARVEST_MS = 2200;
  const CFG_PROJECTS_NATIVE_HARVEST_COOLDOWN_MS = 30 * 1000;
  const CFG_PROJECTS_NATIVE_AUTH_COOLDOWN_MS = 5 * 60 * 1000;
  const CFG_PROJECTS_MANUAL_REFRESH_TIMEOUT_MS = 7000;
  const CFG_PROJECTS_DEFERRED_RECONCILE_MS = 120;
  const CFG_PROJECTS_STARTUP_RERENDER_DEFER_MS = 900;
  const CFG_PROJECTS_RENDER_INITIAL_ROWS = 60;
  const CFG_PROJECTS_RENDER_CHUNK_ROWS = 90;
  const CFG_PROJECTS_SOURCE = 'snorlax-sidebar';
  const CFG_PROJECTS_TARGET_PATH = '/backend-api/gizmos/snorlax/sidebar';
  const CFG_PROJECTS_NATIVE_HEADER_NAMES = Object.freeze([
    'accept',
    'oai-client-build-number',
    'oai-client-version',
    'oai-device-id',
    'oai-language',
    'oai-session-id',
    'x-openai-target-path',
    'x-openai-target-route',
  ]);
  const CFG_CATEGORY_OPEN_MODE_PAGE = 'page';
  const CFG_MORE_OPEN_MODE_PAGE = 'page';
  const CFG_MORE_OPEN_MODE_DROPDOWN = 'dropdown';

  const FRAG_SVG_FOLDER = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z"
            fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>
  `;
  const FRAG_SVG_CATEGORY = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7.5h14M5 12h14M5 16.5h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M8 5.5 6.8 18.5M17.2 5.5 16 18.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    </svg>
  `;

  const SEL = {
    projectsLabelH2: 'h2.__menu-label',
    projectsSectionA: 'div.group\\/sidebar-expando-section',
    projectsSectionB: 'div[class*="sidebar-expando-section"]',
    nav: 'nav',
    aside: 'aside',
    sidebarTruncate: '.truncate,[class*="truncate"]',
  };

  const storage = {
    getJSON(key, fallback = null) {
      try {
        const raw = W.localStorage?.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    setJSON(key, value) {
      try {
        W.localStorage?.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
  };

  const normText = (raw) => String(raw || '').trim().replace(/\s+/g, ' ');
  const safeRemove = (node) => { try { node?.remove?.(); } catch {} };

  function getSharedFoldersState() {
    return H2O?.FS?.fldrs?.state || null;
  }

  // STATE/CLEAN proxies: reads/writes first check H2O.FS.fldrs.state (0F3a's shared vault).
  // See module header for why this coupling exists and why it must not be copied.
  const localState = (MOD.state = MOD.state || {});
  const localClean = (localState.clean = localState.clean || {
    timers: new Set(),
    observers: new Set(),
    listeners: new Set(),
    nodes: new Set(),
  });
  const STATE = new Proxy(localState, {
    get(target, prop, receiver) {
      const shared = getSharedFoldersState();
      if (shared && Object.prototype.hasOwnProperty.call(shared, prop)) return shared[prop];
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
      const shared = getSharedFoldersState();
      if (shared && typeof shared === 'object') shared[prop] = value;
      return Reflect.set(target, prop, value, receiver);
    },
  });
  const CLEAN = new Proxy(localClean, {
    get(target, prop, receiver) {
      const shared = getSharedFoldersState()?.clean;
      if (shared && Object.prototype.hasOwnProperty.call(shared, prop)) return shared[prop];
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
      const shared = getSharedFoldersState()?.clean;
      if (shared && typeof shared === 'object') shared[prop] = value;
      return Reflect.set(target, prop, value, receiver);
    },
  });

  STATE.projectsStoreInvalidated = !!STATE.projectsStoreInvalidated;
  STATE.projectsRefreshPromise = STATE.projectsRefreshPromise || null;
  STATE.projectsRefreshTimer = Number(STATE.projectsRefreshTimer || 0) || 0;
  STATE.projectsNativeHarvesting = !!STATE.projectsNativeHarvesting;
  STATE.projectsNativeHarvestPromise = STATE.projectsNativeHarvestPromise || null;
  STATE.projectsNativeHarvestLastAt = Number(STATE.projectsNativeHarvestLastAt || 0) || 0;
  STATE.projectsNativeAuthBlockedUntil = Number(STATE.projectsNativeAuthBlockedUntil || 0) || 0;
  STATE.projectsNativeLastFetchAt = Number(STATE.projectsNativeLastFetchAt || 0) || 0;
  STATE.projectsNativeLastFetchStatus = Number(STATE.projectsNativeLastFetchStatus || 0) || 0;
  STATE.projectsNativeLastFetchError = String(STATE.projectsNativeLastFetchError || '');
  STATE.projectsNativeFetchCaptureHooked = !!STATE.projectsNativeFetchCaptureHooked;
  STATE.projectsMorePageOverrideHooked = !!STATE.projectsMorePageOverrideHooked;
  STATE.projectsCanonicalStoreHooked = !!STATE.projectsCanonicalStoreHooked;
  STATE.projectsIconCorpusCache = STATE.projectsIconCorpusCache || null;
  STATE.projectsIconCorpusCacheAt = Number(STATE.projectsIconCorpusCacheAt || 0) || 0;
  STATE.projectsPageScrollActiveUntil = Number(STATE.projectsPageScrollActiveUntil || 0) || 0;
  STATE.projectsDeferredRerenderTimer = Number(STATE.projectsDeferredRerenderTimer || 0) || 0;
  STATE.projectsDeferredLoadTimer = Number(STATE.projectsDeferredLoadTimer || 0) || 0;
  STATE.projectsPageOpeningUntil = Number(STATE.projectsPageOpeningUntil || 0) || 0;
  STATE.projectsManualRefreshRunning = !!STATE.projectsManualRefreshRunning;
  STATE.projectsManualRefreshDoneUntil = Number(STATE.projectsManualRefreshDoneUntil || 0) || 0;
  STATE.projectsBooted = !!STATE.projectsBooted;

  function getRouteService() {
    return core.getService?.('route') || null;
  }

  function getUiShellService() {
    return core.getService?.('ui-shell') || null;
  }

  function getPageHostService() {
    return core.getService?.('page-host') || null;
  }

  function getNativeSidebarService() {
    return core.getService?.('native-sidebar') || null;
  }

  function normalizeHexColor(raw) {
    const value = String(raw || '').trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : '';
  }

  function normalizeCategoryOpenMode(raw) {
    const value = String(raw || '').trim().toLowerCase();
    return value === 'panel' ? 'panel' : CFG_CATEGORY_OPEN_MODE_PAGE;
  }

  function readUi() {
    let ui = storage.getJSON(KEY_FSECTION_STATE_UI_V1, null);
    if (!ui || typeof ui !== 'object') ui = storage.getJSON(KEY_LEG_UI, null);
    if (!ui || typeof ui !== 'object') ui = {};
    return ui;
  }

  function normalizeMoreOpenMode(raw) {
    const value = String(raw || '').trim().toLowerCase();
    return value === CFG_MORE_OPEN_MODE_DROPDOWN ? CFG_MORE_OPEN_MODE_DROPDOWN : CFG_MORE_OPEN_MODE_PAGE;
  }

  function getProjectMoreOpenMode() {
    const fn = H2O.folders?.getProjectMoreOpenMode;
    if (typeof fn === 'function') return fn();
    return normalizeMoreOpenMode(readUi().projectMoreOpenMode);
  }

  function getProjectInlinePreviewOnOpen() {
    const fn = H2O.folders?.getProjectInlinePreviewOnOpen;
    if (typeof fn === 'function') return fn();
    return readUi().projectInlinePreviewOnOpen !== false;
  }

  function DOM_hasClassTokens(el, tokens) {
    const cls = String(el?.className || '');
    return tokens.every((token) => cls.split(/\s+/).includes(token));
  }

  function DOM_classText(el) {
    return String(el?.className || '');
  }

  function DOM_isScrollPageHost(el) {
    if (!(el instanceof HTMLElement)) return false;
    const cls = DOM_classText(el);
    return cls.includes('group/scroll-root') ||
      (cls.includes('overflow-y-auto') && cls.includes('flex-col') && cls.includes('min-h-0'));
  }

  function DOM_resolveRightPanePageHost() {
    const main = D.querySelector('main');
    if (main instanceof HTMLElement) {
      const candidates = [main, ...main.querySelectorAll('div')];
      const scrollRoot = candidates.find((el) => DOM_isScrollPageHost(el));
      if (scrollRoot instanceof HTMLElement) return scrollRoot;
      return main;
    }

    const thread = main?.closest?.('#thread') || D.getElementById('thread');
    const composer = thread?.parentElement || null;
    const shell = composer?.parentElement || null;
    if (shell instanceof HTMLElement && DOM_hasClassTokens(shell, ['relative', 'grow', 'grid'])) return shell;
    if (composer instanceof HTMLElement && (
      String(composer.className || '').includes('composer-parent') ||
      composer.getAttribute('role') === 'presentation'
    )) return composer;
    if (thread instanceof HTMLElement) return thread;
    return main instanceof HTMLElement ? main : null;
  }

  function PROJECTS_ENV() {
    return {
      W,
      D,
      H2O,
      STATE,
      CLEAN,
      SAFE_remove: safeRemove,
      ATTR_CGXUI,
      ATTR_CGXUI_OWNER,
      ATTR_CGXUI_STATE,
      ATTR_CGXUI_MODE,
      ATTR_CGXUI_PAGE_HIDDEN,
      UI_FSECTION_VIEWER,
      UI_FSECTION_PAGE_HOST,
      UI_FSECTION_PAGE,
      CFG_H2O_PAGE_ROUTE_OWNER,
      CFG_H2O_PAGE_ROUTE_PREFIX,
      CFG_H2O_PAGE_QUERY_FLAG,
      CFG_H2O_PAGE_QUERY_VIEW,
      CFG_H2O_PAGE_QUERY_ID,
      SkID: OWNER_SKID,
      STORE_normalizeCategoryOpenMode: normalizeCategoryOpenMode,
      STORE_normalizeHexColor: normalizeHexColor,
      FRAG_SVG_CATEGORY,
      FRAG_SVG_FOLDER,
      DOM_resolveRightPanePageHost,
      UI_setProjectsRefreshButtonState,
      UI_handleProjectsManualRefresh,
    };
  }

  function nativeSidebarEnv() {
    return {
      D,
      normalizeText: normText,
      projectsLabelSelector: SEL.projectsLabelH2,
      projectsSectionSelectors: [SEL.projectsSectionA, SEL.projectsSectionB],
      sidebarItemSelector: '.__menu-item',
      moreLabel: 'More',
    };
  }

  function DOM_findProjectsH2_local() {
    const labels = [...D.querySelectorAll(SEL.projectsLabelH2)];
    return labels.find((el) => /projects/i.test(normText(el.textContent || ''))) || null;
  }

  function DOM_findProjectsSection_local(h2) {
    if (!h2) return null;
    const btn = h2.closest('button');
    if (!btn) return null;
    return btn.closest(SEL.projectsSectionA) || btn.closest(SEL.projectsSectionB) || null;
  }

  function DOM_getProjectsMoreRow_local(projectsSection = DOM_findProjectsSection_local(DOM_findProjectsH2_local())) {
    if (!projectsSection) return null;
    const rows = [...projectsSection.querySelectorAll('.__menu-item')];
    return rows.find((row) => normText(row.textContent || '') === 'More') || null;
  }

  function DOM_findProjectsH2() {
    const svc = getNativeSidebarService();
    return svc?.findProjectsH2?.(nativeSidebarEnv()) || DOM_findProjectsH2_local();
  }

  function DOM_findProjectsSection(h2) {
    const svc = getNativeSidebarService();
    return svc?.findProjectsSection?.(nativeSidebarEnv(), h2) || DOM_findProjectsSection_local(h2);
  }

  function DOM_getProjectsMoreRow(projectsSection = DOM_findProjectsSection(DOM_findProjectsH2())) {
    const svc = getNativeSidebarService();
    return svc?.getProjectsMoreRow?.(nativeSidebarEnv(), projectsSection) || DOM_getProjectsMoreRow_local(projectsSection);
  }

  function DOM_isH2OOwnedNode(node) {
    const svc = getNativeSidebarService();
    try {
      if (typeof svc?.isH2OOwnedNode === 'function') return !!svc.isH2OOwnedNode(node);
    } catch {}
    try {
      const el = node?.nodeType === 1
        ? node
        : (node?.parentElement || (node?.parentNode?.nodeType === 1 ? node.parentNode : null));
      return !!(el?.closest?.(`[${ATTR_CGXUI_OWNER}],[${ATTR_CGXUI}]`));
    } catch {
      return false;
    }
  }

  function DOM_mutationHasOnlyH2OOwnedNodes(muts) {
    const svc = getNativeSidebarService();
    try {
      if (typeof svc?.mutationHasOnlyH2OOwnedNodes === 'function') {
        return !!svc.mutationHasOnlyH2OOwnedNodes(muts);
      }
    } catch {}
    return false;
  }

  function UI_makeInShellPageShell(...args) {
    const svc = getUiShellService();
    return svc?.UI_makeInShellPageShell?.(PROJECTS_ENV(), ...args) || null;
  }

  function UI_mountInShellPage(...args) {
    const svc = getPageHostService();
    return !!svc?.UI_mountInShellPage?.(PROJECTS_ENV(), ...args);
  }

  function UI_closeViewer(...args) {
    const svc = getPageHostService();
    return svc?.UI_closeViewer?.(PROJECTS_ENV(), ...args);
  }

  function ROUTE_commitPageRoute(...args) {
    const svc = getRouteService();
    return svc?.ROUTE_commitPageRoute?.(PROJECTS_ENV(), ...args);
  }

  function TIME_addListener(addFn, removeFn) {
    try { addFn(); } catch (error) { err('addListener', error); }
    CLEAN.listeners.add(removeFn);
  }

  function DOM_collectNativeProjectAnchors(root, opts = {}) {
    if (!root?.querySelectorAll) return [];
    const projectsSection = opts.excludeProjectsSection ? DOM_findProjectsSection(DOM_findProjectsH2()) : null;
    return [...root.querySelectorAll('a[href*="/g/"][href$="/project"]')]
      .filter((row) => {
        if (DOM_isH2OOwnedNode(row)) return false;
        if (projectsSection?.contains?.(row)) return false;
        if (opts.excludeSidebar && row.closest?.(`${SEL.nav},${SEL.aside}`)) return false;
        return !!row.getAttribute('href');
      });
  }

  function PROJECTS_idFromHref(href) {
    const path = String(href || '').split(/[?#]/)[0];
    const match = path.match(/\/g\/([^/]+)\/project$/);
    return match ? match[1] : '';
  }

  function DOM_collectNativeProjectRows(root, opts = {}) {
    const seen = new Set();
    return DOM_collectNativeProjectAnchors(root, opts)
      .map((row, index) => {
        const href = row.getAttribute('href') || '';
        if (!href || seen.has(href)) return null;
        seen.add(href);
        const title = normText(row.querySelector?.(SEL.sidebarTruncate)?.textContent || row.textContent || href);
        const icon = row.querySelector?.('[data-testid="project-folder-icon"]') || row.querySelector?.('.icon svg, svg.icon');
        return {
          id: PROJECTS_idFromHref(href),
          href,
          title: title || href,
          iconHtml: icon?.outerHTML || '',
          index,
          source: opts.source || 'dom',
        };
      })
      .filter(Boolean);
  }

  function DOM_getNativeProjectRows(projectsSection = DOM_findProjectsSection(DOM_findProjectsH2()), opts = {}) {
    const rows = DOM_collectNativeProjectRows(projectsSection, { source: 'sidebar' });
    return opts.overflowOnly ? rows.slice(CFG_SEE_MORE_LIMIT) : rows;
  }

  function DOM_getNativeProjectDropdownRows() {
    const portalRows = DOM_collectNativeProjectRows(D, {
      source: 'dropdown-dom',
      excludeProjectsSection: true,
      excludeSidebar: true,
    });
    if (portalRows.length) return portalRows;
    return DOM_collectNativeProjectRows(D, {
      source: 'dropdown-dom',
      excludeProjectsSection: true,
    });
  }

  function DOM_getNativeProjectDropdownAnchors() {
    const portalRows = DOM_collectNativeProjectAnchors(D, {
      source: 'dropdown-dom',
      excludeProjectsSection: true,
      excludeSidebar: true,
    });
    if (portalRows.length) return portalRows;
    return DOM_collectNativeProjectAnchors(D, {
      source: 'dropdown-dom',
      excludeProjectsSection: true,
    });
  }

  function DOM_scrollNativeProjectDropdownPanels() {
    const anchors = DOM_getNativeProjectDropdownAnchors();
    const panels = new Set();
    anchors.forEach((anchor) => {
      let node = anchor.parentElement;
      while (node && node !== D.body && node !== D.documentElement) {
        if (node.scrollHeight > node.clientHeight + 8) panels.add(node);
        node = node.parentElement;
      }
    });
    let moved = false;
    panels.forEach((panel) => {
      const before = panel.scrollTop;
      const stepSize = Math.max(240, Math.floor((panel.clientHeight || 320) * 0.9));
      panel.scrollTop = Math.min(panel.scrollHeight, before + stepSize);
      if (panel.scrollTop !== before) moved = true;
      try { panel.dispatchEvent(new Event('scroll', { bubbles: true })); } catch {}
    });
    return moved;
  }

  function PROJECTS_normalizeRow(row, index = 0) {
    if (!row || typeof row !== 'object') return null;
    const href = String(row.href || '').trim();
    if (!href || !/\/g\/.+\/project(?:$|[?#])/.test(href)) return null;
    const id = String(row.id || row.projectId || PROJECTS_idFromHref(href) || '').trim();
    return {
      id,
      href,
      title: normText(row.title || row.name || href),
      iconHtml: String(row.iconHtml || ''),
      index: Number.isFinite(Number(row.index)) ? Number(row.index) : index,
      source: String(row.source || 'unknown'),
    };
  }

  function PROJECTS_isGeneratedFolderIcon(iconHtml) {
    const html = String(iconHtml || '');
    return !!html &&
      !/data-testid=["']project-folder-icon["']/.test(html) &&
      !/\/cdn\/assets\/sprites-core-[^"']+\.svg#/i.test(html) &&
      /M3 6\.5A2\.5 2\.5 0 0 1 5\.5 4H10l2 2h6\.5/.test(html);
  }

  function PROJECTS_escapeAttr(value) {
    return String(value || '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[m]));
  }

  function PROJECTS_iconPartsFromHtml(iconHtml) {
    const html = String(iconHtml || '');
    if (!html || PROJECTS_isGeneratedFolderIcon(html)) return null;
    const useHref = (html.match(/<use\b[^>]*\bhref=["']([^"']+)["']/i) || [])[1] || '';
    if (!/\/cdn\/assets\/sprites-core-[^"']+\.svg#[a-z0-9]+/i.test(useHref)) return null;
    const label = (html.match(/\baria-label=["']([^"']+)["']/i) || [])[1] || '';
    return {
      useHref,
      label: normText(label).replace(/^(Blue|Green|Orange|Pink|Purple|Red|Yellow)\s+/i, ''),
    };
  }

  function PROJECTS_normalizeApiColor(color) {
    const value = String(color || '').trim();
    if (/^#[0-9a-f]{3,8}$/i.test(value)) return value;
    if (/^rgb(a)?\([0-9,\s.%-]+\)$/i.test(value)) return value;
    return '';
  }

  function PROJECTS_iconHtmlFromParts(parts, colorRaw, emojiRaw = '') {
    if (!parts?.useHref) return '';
    const color = PROJECTS_normalizeApiColor(colorRaw) || 'currentColor';
    const fallbackLabel = normText(String(emojiRaw || '').replace(/[-_]+/g, ' ')) || 'Project';
    const label = PROJECTS_escapeAttr(parts.label || fallbackLabel);
    const href = PROJECTS_escapeAttr(parts.useHref);
    const styleColor = PROJECTS_escapeAttr(color);
    return `<div data-testid="project-folder-icon" class="" style="color: ${styleColor};"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-label="${label}" class="icon"><use href="${href}" fill="currentColor"></use></svg></div>`;
  }

  function PROJECTS_nativeDisplayMetaByHref() {
    const byHref = new Map();
    PROJECTS_storageHandles().forEach((store) => {
      try {
        for (let i = 0; i < store.length; i += 1) {
          const key = String(store.key(i) || '');
          if (!/\/snorlax-history$/.test(key)) continue;
          const raw = store.getItem(key);
          if (!raw) continue;
          let parsed = null;
          try { parsed = JSON.parse(raw); } catch { continue; }
          const pages = Array.isArray(parsed?.value?.pages) ? parsed.value.pages : [];
          pages.forEach((page) => {
            (Array.isArray(page?.items) ? page.items : []).forEach((item) => {
              const gizmo = item?.gizmo?.gizmo || item?.gizmo || item;
              const shortUrl = String(gizmo?.short_url || gizmo?.id || '').trim();
              if (!shortUrl) return;
              const display = gizmo?.display || {};
              byHref.set(`/g/${shortUrl}/project`, {
                emoji: String(display.emoji || '').trim().toLowerCase(),
                theme: String(display.theme || '').trim(),
              });
            });
          });
        }
      } catch {}
    });
    return byHref;
  }

  function PROJECTS_iconCorpusFromKnownNativeRows(extraRowsRaw = []) {
    const now = Date.now();
    if (
      STATE.projectsIconCorpusCache &&
      (now - Number(STATE.projectsIconCorpusCacheAt || 0)) < CFG_PROJECTS_CACHE_TTL_MS
    ) {
      return STATE.projectsIconCorpusCache;
    }

    const metaByHref = PROJECTS_nativeDisplayMetaByHref();
    const store = PROJECTS_readStore();
    const rows = PROJECTS_mergeRows(
      store.rows || [],
      PROJECTS_bestRows(store),
      DOM_getNativeProjectRows(DOM_findProjectsSection(DOM_findProjectsH2()), { overflowOnly: false }),
      DOM_getNativeProjectDropdownRows(),
      Array.isArray(extraRowsRaw) ? extraRowsRaw : []
    );
    const byEmoji = new Map();
    rows.forEach((row) => {
      const meta = metaByHref.get(row.href);
      const emoji = String(meta?.emoji || '').trim().toLowerCase();
      if (!emoji || byEmoji.has(emoji)) return;
      const parts = PROJECTS_iconPartsFromHtml(row.iconHtml);
      if (parts) byEmoji.set(emoji, parts);
    });

    const corpus = { byEmoji, metaByHref };
    STATE.projectsIconCorpusCache = corpus;
    STATE.projectsIconCorpusCacheAt = now;
    return corpus;
  }

  function PROJECTS_pickIconHtml(previousIcon, nextIcon) {
    const previous = String(previousIcon || '');
    const next = String(nextIcon || '');
    if (!next) return previous;
    if (!previous) return next;
    if (PROJECTS_isGeneratedFolderIcon(next) && !PROJECTS_isGeneratedFolderIcon(previous)) return previous;
    return next;
  }

  function PROJECTS_mergeRows(...groups) {
    const order = [];
    const byHref = new Map();
    for (const group of groups) {
      const rows = Array.isArray(group) ? group : [];
      rows.forEach((raw, index) => {
        const row = PROJECTS_normalizeRow(raw, index);
        if (!row) return;
        const prev = byHref.get(row.href);
        if (!prev) order.push(row.href);
        byHref.set(row.href, {
          ...(prev || {}),
          ...row,
          title: row.title || prev?.title || row.href,
          iconHtml: PROJECTS_pickIconHtml(prev?.iconHtml, row.iconHtml),
          index: prev?.index ?? row.index,
        });
      });
    }
    return order.map((href) => byHref.get(href)).filter(Boolean);
  }

  function PROJECTS_enrichRows(baseRows, ...groups) {
    const base = PROJECTS_mergeRows(baseRows);
    const extras = PROJECTS_mergeRows(...groups);
    const extraByHref = new Map(extras.map((row) => [row.href, row]));
    return base.map((row, index) => PROJECTS_normalizeRow({
      ...row,
      title: extraByHref.get(row.href)?.title || row.title,
      iconHtml: extraByHref.get(row.href)?.iconHtml || row.iconHtml,
      index,
      source: row.source || extraByHref.get(row.href)?.source || 'api',
    }, index)).filter(Boolean);
  }

  function PROJECTS_rowsSignature(rows) {
    return PROJECTS_mergeRows(rows).map((row) => `${row.href}\u0001${row.title}\u0001${row.iconHtml || ''}`).join('\u0002');
  }

  function PROJECTS_serializeRows(rows) {
    return PROJECTS_mergeRows(rows).map((row, index) => ({
      id: row.id,
      href: row.href,
      title: row.title,
      iconHtml: row.iconHtml,
      index,
      source: row.source || 'cache',
    }));
  }

  function PROJECTS_sourceRank(source, complete = false) {
    const value = String(source || '').toLowerCase();
    if (complete && value.includes(CFG_PROJECTS_SOURCE)) return 90;
    if (/native-snorlax-history/.test(value)) return 85;
    if (/^(native-autoharvest|dropdown-dom)/.test(value)) return 80;
    if (/native-fetch-observed/.test(value)) return 70;
    if (value.includes(CFG_PROJECTS_SOURCE)) return 60;
    if (/^(sidebar|document|dom)/.test(value)) return 30;
    if (/previous-store|legacy|cache/.test(value)) return 20;
    return 10;
  }

  function PROJECTS_knownIdsFromRows(rows) {
    return [...new Set(PROJECTS_serializeRows(rows).map((row) => row.id || PROJECTS_idFromHref(row.href)).filter(Boolean))];
  }

  function PROJECTS_bestRows(store) {
    const rows = PROJECTS_serializeRows(store?.rows || []);
    const bestRows = PROJECTS_serializeRows(store?.bestRows || []);
    return bestRows.length >= rows.length ? bestRows : rows;
  }

  function PROJECTS_pageRowsFromStore(storeRaw, ...groups) {
    const store = PROJECTS_normalizeStore(storeRaw);
    const canonicalRows = PROJECTS_bestRows(store);
    const baseRows = canonicalRows.length ? canonicalRows : PROJECTS_serializeRows(store.rows || []);
    return baseRows.length ? PROJECTS_enrichRows(baseRows, ...groups) : PROJECTS_mergeRows(...groups);
  }

  function PROJECTS_pageRowsSignatureFromStore(storeRaw) {
    return PROJECTS_rowsSignature(PROJECTS_pageRowsFromStore(storeRaw));
  }

  function PROJECTS_pageRowsCountFromStore(storeRaw) {
    return PROJECTS_pageRowsFromStore(storeRaw).length;
  }

  function PROJECTS_pickBestSnapshot(currentRaw, candidateRaw, meta = {}) {
    const currentRows = PROJECTS_serializeRows(currentRaw);
    const candidateRows = PROJECTS_serializeRows(candidateRaw);
    const currentRank = Number(meta.currentRank || 0) || 0;
    const candidateRank = Number(meta.candidateRank || 0) || 0;
    const candidateComplete = meta.candidateComplete === true;
    if (!currentRows.length) return { rows: candidateRows, promoted: !!candidateRows.length };
    if (!candidateRows.length) return { rows: currentRows, promoted: false };
    if (candidateRows.length > currentRows.length) return { rows: candidateRows, promoted: true };
    if (candidateRows.length === currentRows.length && candidateRank >= currentRank) return { rows: candidateRows, promoted: true };
    if (candidateComplete && candidateRank >= currentRank) return { rows: candidateRows, promoted: true };
    return { rows: PROJECTS_mergeRows(currentRows, candidateRows), promoted: false };
  }

  function PROJECTS_emptyStore(extra = {}) {
    const rows = PROJECTS_serializeRows(extra.rows || []);
    const bestRows = PROJECTS_serializeRows(extra.bestRows || rows);
    const bestSource = String(extra.bestSource || extra.orderSource || extra.source || CFG_PROJECTS_SOURCE);
    const bestComplete = extra.bestComplete === true || extra.complete === true;
    const bestSourceRank = Number(extra.bestSourceRank || PROJECTS_sourceRank(bestSource, bestComplete)) || 0;
    return {
      version: CFG_PROJECTS_CACHE_VERSION,
      source: String(extra.source || CFG_PROJECTS_SOURCE),
      rows,
      bestRows,
      complete: extra.complete === true,
      lastSuccessAt: Number(extra.lastSuccessAt || 0) || 0,
      lastAttemptAt: Number(extra.lastAttemptAt || 0) || 0,
      pageCount: Number(extra.pageCount || 0) || 0,
      itemCount: Number(extra.itemCount || rows.length) || rows.length,
      nextCursor: String(extra.nextCursor || ''),
      signature: String(extra.signature || PROJECTS_rowsSignature(rows)),
      error: String(extra.error || ''),
      orderSource: String(extra.orderSource || extra.source || CFG_PROJECTS_SOURCE),
      lastReconciledAt: Number(extra.lastReconciledAt || 0) || 0,
      bestSignature: String(extra.bestSignature || PROJECTS_rowsSignature(bestRows)),
      bestSource,
      bestSourceRank,
      bestRowCount: Number(extra.bestRowCount || bestRows.length) || bestRows.length,
      bestAt: Number(extra.bestAt || extra.lastReconciledAt || extra.lastSuccessAt || 0) || 0,
      bestComplete,
      knownProjectIds: Array.isArray(extra.knownProjectIds) && extra.knownProjectIds.length
        ? [...new Set(extra.knownProjectIds.map((v) => String(v || '').trim()).filter(Boolean))]
        : PROJECTS_knownIdsFromRows(bestRows),
      lastRicherNativeAt: Number(extra.lastRicherNativeAt || 0) || 0,
      sources: (extra.sources && typeof extra.sources === 'object') ? extra.sources : {},
    };
  }

  function PROJECTS_normalizeStore(raw) {
    if (Array.isArray(raw)) {
      const rows = PROJECTS_serializeRows(raw);
      return PROJECTS_emptyStore({
        source: 'legacy-row-cache',
        rows,
        complete: false,
        itemCount: rows.length,
      });
    }
    if (!raw || typeof raw !== 'object') return PROJECTS_emptyStore();
    const rows = PROJECTS_serializeRows(raw.rows || []);
    const bestRows = PROJECTS_serializeRows(raw.bestRows || rows);
    return PROJECTS_emptyStore({
      source: raw.source || CFG_PROJECTS_SOURCE,
      rows,
      bestRows,
      complete: raw.complete === true,
      lastSuccessAt: raw.lastSuccessAt,
      lastAttemptAt: raw.lastAttemptAt,
      pageCount: raw.pageCount,
      itemCount: raw.itemCount || rows.length,
      nextCursor: raw.nextCursor,
      signature: raw.signature || PROJECTS_rowsSignature(rows),
      error: raw.error,
      orderSource: raw.orderSource,
      lastReconciledAt: raw.lastReconciledAt,
      bestSignature: raw.bestSignature || PROJECTS_rowsSignature(bestRows),
      bestSource: raw.bestSource,
      bestSourceRank: raw.bestSourceRank,
      bestRowCount: raw.bestRowCount || bestRows.length,
      bestAt: raw.bestAt,
      bestComplete: raw.bestComplete,
      knownProjectIds: raw.knownProjectIds,
      lastRicherNativeAt: raw.lastRicherNativeAt,
      sources: raw.sources,
    });
  }

  function PROJECTS_readStore() {
    return PROJECTS_normalizeStore(storage.getJSON(KEY_FSECTION_PROJECTS_CACHE_V1, null));
  }

  function PROJECTS_writeStore(store) {
    const normalized = PROJECTS_normalizeStore(store);
    storage.setJSON(KEY_FSECTION_PROJECTS_CACHE_V1, normalized);
    STATE.projectsIconCorpusCache = null;
    STATE.projectsIconCorpusCacheAt = 0;
    return normalized;
  }

  function PROJECTS_storageHandles() {
    const stores = [];
    try { if (W.localStorage) stores.push(W.localStorage); } catch {}
    try { if (W.sessionStorage) stores.push(W.sessionStorage); } catch {}
    return stores;
  }

  function PROJECTS_readNativeSnorlaxHistoryStore() {
    const candidates = [];
    PROJECTS_storageHandles().forEach((store) => {
      try {
        for (let i = 0; i < store.length; i += 1) {
          const key = String(store.key(i) || '');
          if (!/\/snorlax-history$/.test(key)) continue;
          const raw = store.getItem(key);
          if (!raw) continue;
          let parsed = null;
          try { parsed = JSON.parse(raw); } catch { continue; }
          const pages = Array.isArray(parsed?.value?.pages) ? parsed.value.pages : [];
          if (!pages.length) continue;
          const rows = [];
          pages.forEach((page) => {
            const items = Array.isArray(page?.items) ? page.items : [];
            items.forEach((item) => {
              const row = PROJECTS_normalizeApiItem(item, rows.length);
              if (row) rows.push(row);
            });
          });
          const finalPage = pages[pages.length - 1] || {};
          candidates.push({
            key,
            rows: PROJECTS_serializeRows(rows),
            complete: Object.prototype.hasOwnProperty.call(finalPage, 'cursor') && finalPage.cursor === null,
            pageCount: pages.length,
            itemCount: rows.length,
            timestamp: Number(parsed?.timestamp || 0) || 0,
          });
        }
      } catch {}
    });
    candidates.sort((a, b) => {
      if (a.complete !== b.complete) return a.complete ? -1 : 1;
      if (b.rows.length !== a.rows.length) return b.rows.length - a.rows.length;
      return b.timestamp - a.timestamp;
    });
    return candidates[0] || null;
  }

  function PROJECTS_importNativeSnorlaxHistory(storeRaw = null, reason = 'import') {
    const snapshot = PROJECTS_readNativeSnorlaxHistoryStore();
    if (!snapshot?.rows?.length) return storeRaw ? PROJECTS_normalizeStore(storeRaw) : PROJECTS_readStore();
    const previous = storeRaw ? PROJECTS_normalizeStore(storeRaw) : PROJECTS_readStore();
    const source = `native-snorlax-history:${reason}`;
    const next = PROJECTS_applyRowsToStore(previous, snapshot.rows, source, {
      preferOrder: snapshot.rows.length >= PROJECTS_bestRows(previous).length,
      complete: snapshot.complete === true,
      sourceRank: PROJECTS_sourceRank(source, snapshot.complete === true),
    });
    return PROJECTS_emptyStore({
      ...next,
      complete: PROJECTS_storeLooksComplete(next) || snapshot.complete === true,
      pageCount: Math.max(Number(next.pageCount || 0), snapshot.pageCount),
      itemCount: Math.max(Number(next.itemCount || 0), snapshot.itemCount, next.rows.length, next.bestRows.length),
      lastSuccessAt: Math.max(Number(next.lastSuccessAt || 0), snapshot.timestamp || Date.now()),
      lastAttemptAt: Math.max(Number(next.lastAttemptAt || 0), Date.now()),
      nextCursor: snapshot.complete ? '' : next.nextCursor,
      error: snapshot.complete ? '' : next.error,
    });
  }

  function PROJECTS_reconcileStoreSnapshot(storeRaw, candidateRowsRaw, source, opts = {}) {
    const store = PROJECTS_normalizeStore(storeRaw);
    const candidateRows = PROJECTS_serializeRows(candidateRowsRaw);
    const currentBestRows = PROJECTS_bestRows(store);
    const complete = opts.complete === true;
    const sourceRank = Number(opts.sourceRank || PROJECTS_sourceRank(source, complete)) || 0;
    const bestRank = Number(store.bestSourceRank || PROJECTS_sourceRank(store.bestSource || store.orderSource || store.source, store.bestComplete)) || 0;
    const best = PROJECTS_pickBestSnapshot(currentBestRows, candidateRows, {
      currentRank: bestRank,
      candidateRank: sourceRank,
      candidateComplete: complete,
    });
    const bestRows = best.rows;
    const promoted = best.promoted;
    const confirmedShrink = complete && sourceRank >= bestRank && candidateRows.length < currentBestRows.length;
    const now = Date.now();
    const nextRows = confirmedShrink
      ? candidateRows
      : candidateRows.length >= store.rows.length
      ? PROJECTS_mergeRows(candidateRows, store.rows, bestRows)
      : PROJECTS_mergeRows(store.rows, candidateRows, bestRows);
    const bestSource = promoted ? String(source || store.bestSource || store.source || CFG_PROJECTS_SOURCE) : store.bestSource;
    const bestSourceRank = promoted ? sourceRank : bestRank;
    const bestComplete = promoted ? complete : store.bestComplete === true;
    return PROJECTS_emptyStore({
      ...store,
      rows: nextRows,
      bestRows,
      itemCount: confirmedShrink ? nextRows.length : Math.max(Number(store.itemCount || 0), nextRows.length, bestRows.length),
      complete: PROJECTS_storeLooksComplete(store) || complete,
      source: store.source || source,
      signature: PROJECTS_rowsSignature(nextRows),
      orderSource: promoted ? source : (store.orderSource || store.source || source),
      lastReconciledAt: now,
      bestSignature: PROJECTS_rowsSignature(bestRows),
      bestSource,
      bestSourceRank,
      bestRowCount: bestRows.length,
      bestAt: promoted ? now : store.bestAt,
      bestComplete,
      knownProjectIds: PROJECTS_knownIdsFromRows(bestRows),
      lastRicherNativeAt: promoted && sourceRank >= PROJECTS_sourceRank('native-fetch-observed') ? now : store.lastRicherNativeAt,
      sources: {
        ...(store.sources || {}),
        [source]: {
          rowCount: candidateRows.length,
          complete,
          rank: sourceRank,
          at: now,
        },
      },
      error: store.error,
    });
  }

  function PROJECTS_isStoreFresh(store) {
    return !!(
      PROJECTS_storeCanServeFromCache(store) &&
      Array.isArray(store.rows) &&
      store.rows.length &&
      !STATE.projectsStoreInvalidated &&
      (Date.now() - Number(store.lastSuccessAt || 0)) < CFG_PROJECTS_CACHE_TTL_MS
    );
  }

  function PROJECTS_storeLooksComplete(store) {
    if (store?.complete !== true) return false;
    const moreRow = DOM_getProjectsMoreRow();
    if (moreRow && Array.isArray(store.rows) && store.rows.length <= CFG_SEE_MORE_LIMIT) return false;
    return true;
  }

  function PROJECTS_storeHasNativeReconciliation(store) {
    if (!store || !Array.isArray(store.rows) || store.rows.length <= CFG_SEE_MORE_LIMIT) return false;
    const sources = (store.sources && typeof store.sources === 'object') ? store.sources : {};
    if (PROJECTS_bestRows(store).length > CFG_SEE_MORE_LIMIT && Number(store.bestSourceRank || 0) >= PROJECTS_sourceRank('native-fetch-observed')) return true;
    return Object.entries(sources).some(([key, value]) =>
      /^(dropdown-dom|native-autoharvest|native-fetch-observed)/.test(key) &&
      Number(value?.rowCount || 0) > CFG_SEE_MORE_LIMIT
    );
  }

  function PROJECTS_storeCanServeFromCache(store) {
    return PROJECTS_storeLooksComplete(store);
  }

  function PROJECTS_storeHasRichBestSnapshot(store) {
    const bestRows = PROJECTS_bestRows(store);
    return !!(
      bestRows.length > CFG_SEE_MORE_LIMIT &&
      bestRows.length >= PROJECTS_serializeRows(store?.rows || []).length &&
      Number(store?.bestSourceRank || 0) >= PROJECTS_sourceRank('native-fetch-observed')
    );
  }

  function PROJECTS_shouldAutoharvest(store) {
    if (!DOM_getProjectsMoreRow()) return false;
    if ((Date.now() - Number(STATE.projectsNativeHarvestLastAt || 0)) < CFG_PROJECTS_NATIVE_HARVEST_COOLDOWN_MS) return false;
    if (!PROJECTS_storeHasNativeReconciliation(store)) return true;
    if (Array.isArray(store.rows) && store.rows.length <= CFG_SEE_MORE_LIMIT) return true;
    return false;
  }

  function PROJECTS_iconHtmlFromApi(gizmo) {
    const display = gizmo?.display || {};
    const emoji = String(display.emoji || '').trim().toLowerCase();
    if (!emoji) return '';
    const corpus = PROJECTS_iconCorpusFromKnownNativeRows();
    const parts = corpus.byEmoji.get(emoji);
    return parts ? PROJECTS_iconHtmlFromParts(parts, display.theme, emoji) : '';
  }

  function PROJECTS_normalizeApiItem(item, index = 0) {
    const gizmo = item?.gizmo?.gizmo || item?.gizmo || item;
    if (!gizmo || typeof gizmo !== 'object') return null;
    const id = String(gizmo.id || '').trim();
    const shortUrl = String(gizmo.short_url || id || '').trim();
    if (!shortUrl) return null;
    const title = normText(gizmo.display?.name || gizmo.name || shortUrl);
    return PROJECTS_normalizeRow({
      id,
      href: `/g/${shortUrl}/project`,
      title,
      iconHtml: PROJECTS_iconHtmlFromApi(gizmo),
      index,
      source: 'api',
    }, index);
  }

  function PROJECTS_cleanNativeHeaderValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      try { return String(JSON.parse(raw)).trim(); } catch {}
      return raw.slice(1, -1).trim();
    }
    return raw;
  }

  function PROJECTS_readStoredNativeValue(keys = [], patterns = []) {
    const stores = PROJECTS_storageHandles();
    for (const key of keys) {
      for (const store of stores) {
        try {
          const value = PROJECTS_cleanNativeHeaderValue(store.getItem(key));
          if (value) return value;
        } catch {}
      }
    }
    for (const store of stores) {
      try {
        for (let i = 0; i < store.length; i += 1) {
          const key = String(store.key(i) || '');
          if (!patterns.some((pattern) => pattern.test(key))) continue;
          const value = PROJECTS_cleanNativeHeaderValue(store.getItem(key));
          if (value) return value;
        }
      } catch {}
    }
    return '';
  }

  function PROJECTS_uuidNativeHeaderValue(value) {
    const cleaned = PROJECTS_cleanNativeHeaderValue(value);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleaned) ? cleaned : '';
  }

  function PROJECTS_normalizeNativeHeaders(raw) {
    const headers = {};
    if (!raw || typeof raw !== 'object') return headers;
    CFG_PROJECTS_NATIVE_HEADER_NAMES.forEach((name) => {
      const value = PROJECTS_cleanNativeHeaderValue(raw[name]);
      if (value) headers[name] = value;
    });
    return headers;
  }

  function PROJECTS_readObservedNativeHeaders() {
    return PROJECTS_normalizeNativeHeaders(storage.getJSON(KEY_FSECTION_PROJECTS_NATIVE_HEADERS_V1, {}));
  }

  function PROJECTS_extractNativeHeaders(headersLike) {
    const headers = {};
    if (!headersLike) return headers;
    let nativeHeaders = null;
    try {
      const HeadersCtor = W.Headers || (typeof Headers === 'function' ? Headers : null);
      nativeHeaders = HeadersCtor ? new HeadersCtor(headersLike) : null;
    } catch {}
    CFG_PROJECTS_NATIVE_HEADER_NAMES.forEach((name) => {
      let value = '';
      try { value = nativeHeaders?.get?.(name) || ''; } catch {}
      if (!value && headersLike && typeof headersLike === 'object') {
        value = headersLike[name] || headersLike[name.toLowerCase()] || headersLike[name.toUpperCase()] || '';
      }
      value = PROJECTS_cleanNativeHeaderValue(value);
      if (value) headers[name] = value;
    });
    return headers;
  }

  function PROJECTS_observedHeadersFromFetchArgs(input, init) {
    return {
      ...PROJECTS_extractNativeHeaders(input?.headers),
      ...PROJECTS_extractNativeHeaders(init?.headers),
    };
  }

  function PROJECTS_rememberObservedNativeHeaders(headersRaw) {
    const headers = PROJECTS_normalizeNativeHeaders(headersRaw);
    if (!Object.keys(headers).length) return PROJECTS_readObservedNativeHeaders();
    const previous = PROJECTS_readObservedNativeHeaders();
    const next = {
      ...previous,
      ...headers,
      observedAt: Date.now(),
    };
    storage.setJSON(KEY_FSECTION_PROJECTS_NATIVE_HEADERS_V1, next);
    return PROJECTS_normalizeNativeHeaders(next);
  }

  function PROJECTS_pageBuildValue() {
    const html = D.documentElement;
    const dataset = html?.dataset || {};
    const build = PROJECTS_cleanNativeHeaderValue(dataset.build || '');
    if (build) return build.startsWith('prod-') ? build : `prod-${build}`;
    return PROJECTS_readStoredNativeValue(
      ['oai-client-version', 'oaiClientVersion', 'client-version', 'build'],
      [/oai[-_]?client[-_]?version/i, /client[-_]?version/i]
    );
  }

  function PROJECTS_pageBuildNumber() {
    const dataset = D.documentElement?.dataset || {};
    return PROJECTS_cleanNativeHeaderValue(dataset.seq || dataset.buildNumber || '') ||
      PROJECTS_readStoredNativeValue(
        ['oai-client-build-number', 'oaiClientBuildNumber', 'client-build-number', 'buildNumber'],
        [/oai[-_]?client[-_]?build[-_]?number/i, /client[-_]?build[-_]?number/i]
      );
  }

  function PROJECTS_nativeSidebarHeaders() {
    const observed = PROJECTS_readObservedNativeHeaders();
    const headers = {
      accept: observed.accept || '*/*',
      'x-openai-target-path': observed['x-openai-target-path'] || CFG_PROJECTS_TARGET_PATH,
      'x-openai-target-route': observed['x-openai-target-route'] || CFG_PROJECTS_TARGET_PATH,
    };
    const buildNumber = PROJECTS_pageBuildNumber();
    const build = PROJECTS_pageBuildValue();
    const deviceId = PROJECTS_uuidNativeHeaderValue(PROJECTS_readStoredNativeValue(
      ['oai-device-id', 'oaiDeviceId', 'device-id', 'deviceId'],
      [/^oai[-_]?device[-_]?id$/i, /(^|[.:/_-])device[-_]?id$/i]
    ));
    const sessionId = PROJECTS_uuidNativeHeaderValue(PROJECTS_readStoredNativeValue(
      ['oai-session-id', 'oaiSessionId', 'session-id', 'sessionId'],
      [/^oai[-_]?session[-_]?id$/i, /(^|[.:/_-])session[-_]?id$/i]
    ));
    const language = PROJECTS_cleanNativeHeaderValue(D.documentElement?.lang || W.navigator?.language || W.navigator?.userLanguage || '');
    if (observed['oai-client-build-number'] || buildNumber) headers['oai-client-build-number'] = observed['oai-client-build-number'] || buildNumber;
    if (observed['oai-client-version'] || build) headers['oai-client-version'] = observed['oai-client-version'] || build;
    if (observed['oai-device-id'] || deviceId) headers['oai-device-id'] = observed['oai-device-id'] || deviceId;
    if (observed['oai-language'] || language) headers['oai-language'] = observed['oai-language'] || language;
    if (observed['oai-session-id'] || sessionId) headers['oai-session-id'] = observed['oai-session-id'] || sessionId;
    return headers;
  }

  function PROJECTS_isExplicitRefreshReason(reason = '') {
    return /(?:manual|explicit|user|force)/i.test(String(reason || ''));
  }

  function PROJECTS_nativeAuthCooldownRemainingMs() {
    const remaining = Number(STATE.projectsNativeAuthBlockedUntil || 0) - Date.now();
    if (remaining <= 0) {
      if (STATE.projectsNativeAuthBlockedUntil) STATE.projectsNativeAuthBlockedUntil = 0;
      return 0;
    }
    return remaining;
  }

  function PROJECTS_shouldSkipNativeRefresh(reason = '') {
    return !PROJECTS_isExplicitRefreshReason(reason) && PROJECTS_nativeAuthCooldownRemainingMs() > 0;
  }

  function PROJECTS_recordNativeFetchSuccess(status = 200) {
    STATE.projectsNativeLastFetchAt = Date.now();
    STATE.projectsNativeLastFetchStatus = Number(status || 200) || 200;
    STATE.projectsNativeLastFetchError = '';
    STATE.projectsNativeAuthBlockedUntil = 0;
  }

  function PROJECTS_recordNativeFetchFailure(error, reason = '') {
    const status = Number(error?.status || 0) || 0;
    const message = String(error?.message || error || 'projects-native-fetch-failed');
    STATE.projectsNativeLastFetchAt = Date.now();
    STATE.projectsNativeLastFetchStatus = status;
    STATE.projectsNativeLastFetchError = message;
    if (status === 401) {
      STATE.projectsNativeAuthBlockedUntil = Date.now() + CFG_PROJECTS_NATIVE_AUTH_COOLDOWN_MS;
      step('projects-native-auth-cooldown', `${reason || 'refresh'}:${CFG_PROJECTS_NATIVE_AUTH_COOLDOWN_MS}`);
    }
  }

  async function PROJECTS_fetchNativePage(opts = {}) {
    if (typeof W.fetch !== 'function') return { rows: [], cursor: '', itemCount: 0 };
    const cursor = String(opts.cursor || '');
    const conversationsPerGizmo = opts.conversationsPerGizmo === undefined ? '0' : String(opts.conversationsPerGizmo);
    const params = new URLSearchParams({
      owned_only: 'true',
      conversations_per_gizmo: conversationsPerGizmo,
    });
    if (opts.limit !== undefined && opts.limit !== null) params.set('limit', String(opts.limit));
    if (cursor) params.set('cursor', cursor);
    const res = await W.fetch(`${CFG_PROJECTS_TARGET_PATH}?${params.toString()}`, {
      method: 'GET',
      credentials: 'include',
      headers: PROJECTS_nativeSidebarHeaders(),
    });
    if (!res?.ok) {
      const error = new Error(`Projects sidebar fetch failed: ${res?.status || 'unknown'}`);
      error.status = Number(res?.status || 0) || 0;
      error.statusText = String(res?.statusText || '');
      error.targetPath = CFG_PROJECTS_TARGET_PATH;
      throw error;
    }
    const json = await res.json();
    PROJECTS_recordNativeFetchSuccess(res.status || 200);
    const rows = (Array.isArray(json?.items) ? json.items : [])
      .map((item, index) => PROJECTS_normalizeApiItem(item, index))
      .filter(Boolean);
    return { rows, cursor: String(json?.cursor || ''), itemCount: Array.isArray(json?.items) ? json.items.length : 0 };
  }

  async function PROJECTS_fetchAllProjectsFromSource(source, opts = {}) {
    const startedAt = Date.now();
    const pages = [];
    const seenCursors = new Set();
    let pageCount = 0;
    let itemCount = 0;
    let cursor = '';
    let error = '';
    const limit = opts.limit;
    const firstConversationsPerGizmo = opts.firstConversationsPerGizmo === undefined ? CFG_SEE_MORE_LIMIT : opts.firstConversationsPerGizmo;

    const first = await PROJECTS_fetchNativePage({ conversationsPerGizmo: firstConversationsPerGizmo, limit });
    pages.push(first.rows);
    pageCount += 1;
    itemCount += first.itemCount || first.rows.length;
    cursor = first.cursor;

    while (cursor && pageCount < CFG_PROJECTS_FETCH_PAGE_LIMIT) {
      if (seenCursors.has(cursor)) {
        error = 'pagination-cursor-loop';
        break;
      }
      seenCursors.add(cursor);
      const result = await PROJECTS_fetchNativePage({ conversationsPerGizmo: 0, cursor, limit });
      pages.push(result.rows);
      pageCount += 1;
      itemCount += result.itemCount || result.rows.length;
      cursor = result.cursor;
    }

    if (cursor && !error) error = 'pagination-page-limit';
    const rows = PROJECTS_serializeRows(PROJECTS_mergeRows(...pages));
    if (!cursor && !error && rows.length <= CFG_SEE_MORE_LIMIT && DOM_getProjectsMoreRow()) {
      error = 'native-more-indicates-overflow';
    }
    return PROJECTS_emptyStore({
      source,
      rows,
      complete: !cursor && !error,
      lastSuccessAt: Date.now(),
      lastAttemptAt: startedAt,
      pageCount,
      itemCount,
      nextCursor: cursor,
      error,
      orderSource: source,
      sources: {
        [source]: {
          rowCount: rows.length,
          pageCount,
          complete: !cursor && !error,
          limit: limit === undefined || limit === null ? '' : String(limit),
          at: Date.now(),
        },
      },
    });
  }

  async function PROJECTS_fetchAllProjects() {
    return PROJECTS_fetchAllProjectsFromSource(CFG_PROJECTS_SOURCE, {
      firstConversationsPerGizmo: 0,
      limit: CFG_PROJECTS_AUTH_LIMIT,
    });
  }

  function PROJECTS_recordNativeSidebarPayload(json, source = 'native-fetch-observed') {
    const rows = (Array.isArray(json?.items) ? json.items : [])
      .map((item, index) => PROJECTS_normalizeApiItem(item, index))
      .filter(Boolean);
    if (!rows.length) return PROJECTS_readStore();
    const previous = PROJECTS_readStore();
    const reconciled = PROJECTS_reconcileStoreSnapshot(previous, rows, source, {
      complete: false,
    });
    const next = PROJECTS_writeStore({
      ...reconciled,
      lastSuccessAt: Math.max(Number(reconciled.lastSuccessAt || 0), Date.now()),
      itemCount: Math.max(Number(reconciled.itemCount || 0), rows.length),
      nextCursor: String(json?.cursor || reconciled.nextCursor || ''),
      complete: PROJECTS_storeLooksComplete(reconciled),
      signature: PROJECTS_rowsSignature(reconciled.rows),
    });
    STATE.projectsStoreInvalidated = false;
    PROJECTS_rerenderActivePageIfChanged(previous, next);
    return next;
  }

  function PROJECTS_applyRowsToStore(storeRaw, rowsRaw, source, opts = {}) {
    const store = PROJECTS_normalizeStore(storeRaw);
    const rows = PROJECTS_serializeRows(rowsRaw);
    if (!rows.length) return store;

    const reconciled = PROJECTS_reconcileStoreSnapshot(store, rows, source, opts);
    const incomingRicher = rows.length > store.rows.length;
    const preferIncomingOrder = opts.preferOrder === true || incomingRicher;
    const incomingRank = Number(opts.sourceRank || PROJECTS_sourceRank(source, opts.complete === true)) || 0;
    const confirmedShrink = opts.complete === true &&
      incomingRank >= Number(store.bestSourceRank || 0) &&
      rows.length < PROJECTS_bestRows(store).length;
    const mergedRows = confirmedShrink
      ? rows
      : preferIncomingOrder
      ? PROJECTS_mergeRows(rows, store.rows, reconciled.bestRows)
      : PROJECTS_mergeRows(store.rows, rows, reconciled.bestRows);
    const now = Date.now();
    const sources = {
      ...(reconciled.sources || {}),
      [source]: {
        rowCount: rows.length,
        complete: opts.complete === true,
        rank: incomingRank,
        at: now,
      },
    };

    return PROJECTS_emptyStore({
      ...reconciled,
      rows: mergedRows,
      itemCount: confirmedShrink ? mergedRows.length : Math.max(Number(reconciled.itemCount || 0), mergedRows.length, reconciled.bestRows.length),
      complete: PROJECTS_storeLooksComplete(reconciled) || opts.complete === true,
      source: reconciled.source || source,
      signature: PROJECTS_rowsSignature(mergedRows),
      orderSource: reconciled.bestSource || (preferIncomingOrder ? source : (reconciled.orderSource || reconciled.source || source)),
      lastReconciledAt: now,
      sources,
      error: reconciled.error,
    });
  }

  function PROJECTS_reconcileDropdownRows(reason = 'dropdown') {
    const rows = DOM_getNativeProjectDropdownRows();
    if (!rows.length) return PROJECTS_readStore();
    const previous = PROJECTS_readStore();
    const next = PROJECTS_writeStore(PROJECTS_applyRowsToStore(previous, rows, `dropdown-dom:${reason}`, {
      preferOrder: rows.length >= previous.rows.length,
      complete: false,
    }));
    STATE.projectsStoreInvalidated = false;
    PROJECTS_rerenderActivePageIfChanged(previous, next);
    return next;
  }

  function TIME_delay(ms) {
    return new Promise((resolve) => W.setTimeout(resolve, ms));
  }

  function TIME_withTimeout(promise, timeoutMs, fallbackValue = null) {
    let timer = 0;
    return Promise.race([
      Promise.resolve(promise).then((value) => ({ timedOut: false, value })),
      new Promise((resolve) => {
        timer = W.setTimeout(() => resolve({ timedOut: true, value: fallbackValue }), timeoutMs);
        CLEAN.timers.add(timer);
      }),
    ]).finally(() => {
      if (timer) {
        try { W.clearTimeout(timer); } catch {}
        CLEAN.timers.delete(timer);
      }
    });
  }

  function PROJECTS_dispatchNativeMoreEvent(row, type) {
    if (!row) return false;
    const base = { bubbles: true, cancelable: true, view: W };
    let ev = null;
    try {
      if (/^pointer/.test(type) && typeof W.PointerEvent === 'function') {
        ev = new W.PointerEvent(type, { ...base, pointerType: 'mouse', isPrimary: true, button: 0 });
      } else {
        ev = new MouseEvent(type, { ...base, button: 0 });
      }
      return row.dispatchEvent(ev);
    } catch {
      try { row.click?.(); return true; } catch { return false; }
    }
  }

  function PROJECTS_closeNativeDropdown() {
    const targets = [D.activeElement, D.body, D, W].filter(Boolean);
    targets.forEach((target) => {
      try {
        target.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          bubbles: true,
          cancelable: true,
        }));
      } catch {}
    });
  }

  async function PROJECTS_waitForNativeDropdownHarvest(timeoutMs = CFG_PROJECTS_NATIVE_HARVEST_MS) {
    const started = Date.now();
    let accumulated = [];
    let lastSig = '';
    let stableTicks = 0;

    while ((Date.now() - started) < timeoutMs) {
      const rows = DOM_getNativeProjectDropdownRows();
      if (rows.length) accumulated = PROJECTS_mergeRows(accumulated, rows);
      const sig = PROJECTS_rowsSignature(accumulated);
      const scrolled = DOM_scrollNativeProjectDropdownPanels();
      if (sig && sig === lastSig) stableTicks += 1;
      else stableTicks = 0;
      if (accumulated.length && stableTicks >= 4 && !scrolled) break;
      lastSig = sig;
      await TIME_delay(90);
    }

    return PROJECTS_serializeRows(accumulated);
  }

  async function PROJECTS_autoharvestNativeDropdown(reason = 'page-open') {
    if (STATE.projectsNativeHarvestPromise) return STATE.projectsNativeHarvestPromise;
    const moreRow = DOM_getProjectsMoreRow();
    if (!moreRow) return PROJECTS_readStore();

    STATE.projectsNativeHarvestLastAt = Date.now();
    STATE.projectsNativeHarvesting = true;
    STATE.projectsNativeHarvestPromise = (async () => {
      const previous = PROJECTS_readStore();
      try {
        ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((type) => PROJECTS_dispatchNativeMoreEvent(moreRow, type));
        await TIME_delay(80);
        const rows = await PROJECTS_waitForNativeDropdownHarvest();
        if (!rows.length) return previous;
        const next = PROJECTS_writeStore(PROJECTS_applyRowsToStore(previous, rows, `native-autoharvest:${reason}`, {
          preferOrder: rows.length >= previous.rows.length,
          complete: false,
        }));
        STATE.projectsStoreInvalidated = false;
        PROJECTS_rerenderActivePageIfChanged(previous, next);
        return next;
      } catch (error) {
        err('projectsNativeHarvest', error);
        return PROJECTS_writeStore({
          ...previous,
          lastAttemptAt: Date.now(),
          error: String(error?.message || error || 'native-harvest-failed'),
        });
      } finally {
        PROJECTS_closeNativeDropdown();
        STATE.projectsNativeHarvesting = false;
        STATE.projectsNativeHarvestPromise = null;
      }
    })();
    return STATE.projectsNativeHarvestPromise;
  }

  function PROJECTS_isActivePage() {
    return STATE.pageEl?.getAttribute?.('data-cgxui-page-kind') === 'projects';
  }

  function PROJECTS_isPageScrollActive() {
    return Date.now() < Number(STATE.projectsPageScrollActiveUntil || 0);
  }

  function PROJECTS_isPageOpening() {
    return Date.now() < Number(STATE.projectsPageOpeningUntil || 0);
  }

  function PROJECTS_deferActivePageRerender(previous, next) {
    if (STATE.projectsDeferredRerenderTimer) return;
    STATE.projectsDeferredRerenderTimer = W.setTimeout(() => {
      STATE.projectsDeferredRerenderTimer = 0;
      PROJECTS_rerenderActivePageIfChanged(previous, next);
    }, 450);
    CLEAN.timers.add(STATE.projectsDeferredRerenderTimer);
  }

  function PROJECTS_rerenderActivePageIfChanged(previous, next) {
    if (!PROJECTS_isActivePage()) return;
    const previousSig = PROJECTS_pageRowsSignatureFromStore(previous) || String(previous?.signature || '');
    const nextSig = PROJECTS_pageRowsSignatureFromStore(next) || String(next?.signature || '');
    const nextCount = PROJECTS_pageRowsCountFromStore(next) || Number(next?.rows?.length || 0) || 0;
    const activeSig = String(STATE.pageEl?.getAttribute?.('data-cgxui-project-row-signature') || '');
    const activeCount = Number(STATE.pageEl?.getAttribute?.('data-cgxui-project-row-count') || 0) || 0;
    if (previousSig === nextSig && activeSig === nextSig && activeCount === nextCount) return;
    if (PROJECTS_isPageScrollActive() || PROJECTS_isPageOpening()) {
      PROJECTS_deferActivePageRerender(previous, next);
      return;
    }
    owner.openViewer(null, { skipHistory: true }).catch((error) => err('projectsRefreshRerender', error));
  }

  async function PROJECTS_refreshFullStore(reason = 'refresh') {
    if (STATE.projectsRefreshPromise) return STATE.projectsRefreshPromise;
    const beforeImport = PROJECTS_readStore();
    const previous = PROJECTS_writeStore(PROJECTS_importNativeSnorlaxHistory(beforeImport, `refresh:${reason}`));
    PROJECTS_rerenderActivePageIfChanged(beforeImport, previous);
    if (PROJECTS_shouldSkipNativeRefresh(reason)) {
      step('projects-refresh-skipped-auth-cooldown', reason);
      return previous;
    }
    const attemptedAt = Date.now();
    STATE.projectsRefreshPromise = PROJECTS_fetchAllProjects()
      .then((store) => {
        const previousBest = PROJECTS_bestRows(previous);
        const withPrevious = PROJECTS_applyRowsToStore(store, previousBest, previous.bestSource || previous.orderSource || 'previous-store', {
          preferOrder: previousBest.length > store.rows.length,
          complete: false,
          sourceRank: previous.bestSourceRank || PROJECTS_sourceRank(previous.bestSource || previous.orderSource || 'previous-store', previous.bestComplete),
        });
        const dropdownRows = DOM_getNativeProjectDropdownRows();
        const withDropdown = PROJECTS_applyRowsToStore(withPrevious, dropdownRows, 'dropdown-dom:refresh', {
          preferOrder: dropdownRows.length >= PROJECTS_bestRows(withPrevious).length,
          complete: false,
        });
        const reconciled = PROJECTS_reconcileStoreSnapshot(withDropdown, store.rows, store.source || CFG_PROJECTS_SOURCE, {
          complete: store.complete === true,
          sourceRank: PROJECTS_sourceRank(store.source || CFG_PROJECTS_SOURCE, store.complete === true),
        });
        const next = PROJECTS_writeStore({
          ...reconciled,
          ...store,
          rows: reconciled.rows,
          bestRows: reconciled.bestRows,
          complete: PROJECTS_storeLooksComplete(reconciled),
          itemCount: Math.max(store.itemCount || 0, reconciled.rows.length, reconciled.bestRows.length),
          signature: PROJECTS_rowsSignature(reconciled.rows),
          orderSource: reconciled.orderSource || store.orderSource,
          sources: reconciled.sources,
          lastReconciledAt: reconciled.lastReconciledAt,
          bestSignature: PROJECTS_rowsSignature(reconciled.bestRows),
          bestSource: reconciled.bestSource,
          bestSourceRank: reconciled.bestSourceRank,
          bestRowCount: reconciled.bestRows.length,
          bestAt: reconciled.bestAt,
          bestComplete: reconciled.bestComplete,
          knownProjectIds: PROJECTS_knownIdsFromRows(reconciled.bestRows),
          lastRicherNativeAt: reconciled.lastRicherNativeAt,
          source: `${store.source || CFG_PROJECTS_SOURCE}:${reason}`,
          lastAttemptAt: attemptedAt,
        });
        STATE.projectsStoreInvalidated = false;
        PROJECTS_rerenderActivePageIfChanged(previous, next);
        return next;
      })
      .catch((error) => {
        PROJECTS_recordNativeFetchFailure(error, reason);
        err('projectsRefresh', error);
        const fallback = PROJECTS_writeStore({
          ...previous,
          lastAttemptAt: attemptedAt,
          error: String(error?.message || error || 'projects-refresh-failed'),
        });
        return fallback;
      })
      .finally(() => { STATE.projectsRefreshPromise = null; });
    return STATE.projectsRefreshPromise;
  }

  function PROJECTS_scheduleRefresh(reason = 'stale') {
    if (STATE.projectsRefreshTimer) {
      try { W.clearTimeout(STATE.projectsRefreshTimer); } catch {}
    }
    if (PROJECTS_shouldSkipNativeRefresh(reason)) {
      STATE.projectsRefreshTimer = 0;
      step('projects-refresh-schedule-skipped-auth-cooldown', reason);
      return;
    }
    STATE.projectsRefreshTimer = W.setTimeout(() => {
      STATE.projectsRefreshTimer = 0;
      PROJECTS_refreshFullStore(reason).catch((error) => err('projectsRefreshScheduled', error));
    }, 250);
    CLEAN.timers.add(STATE.projectsRefreshTimer);
  }

  function PROJECTS_invalidateStore(reason = 'mutation') {
    STATE.projectsStoreInvalidated = true;
    PROJECTS_scheduleRefresh(reason);
  }

  function PROJECTS_mutationTouchesNativeRows(muts) {
    if (DOM_mutationHasOnlyH2OOwnedNodes(muts)) return false;
    const isProjectNode = (node) => {
      if (!node || node.nodeType !== 1) return false;
      if (DOM_isH2OOwnedNode(node)) return false;
      return !!(
        node.matches?.('a[href*="/g/"][href$="/project"]') ||
        node.querySelector?.('a[href*="/g/"][href$="/project"]') ||
        (node.classList?.contains('__menu-item') && /project/i.test(node.textContent || ''))
      );
    };
    return muts.some((mu) => {
      if (isProjectNode(mu.target)) return true;
      return [...mu.addedNodes, ...mu.removedNodes].some(isProjectNode);
    });
  }

  async function PROJECTS_loadRows(projectsRaw = null, opts = {}) {
    const allowBackgroundRefresh = opts.backgroundRefresh !== false && !PROJECTS_shouldSkipNativeRefresh('background-page-open');
    PROJECTS_reconcileDropdownRows('page-load');
    let beforeImport = PROJECTS_readStore();
    let cached = PROJECTS_writeStore(PROJECTS_importNativeSnorlaxHistory(beforeImport, 'page-load'));
    PROJECTS_rerenderActivePageIfChanged(beforeImport, cached);
    if (!opts.forceRefresh && PROJECTS_shouldAutoharvest(cached)) {
      await PROJECTS_autoharvestNativeDropdown('page-load');
      PROJECTS_reconcileDropdownRows('post-autoharvest');
      beforeImport = PROJECTS_readStore();
      cached = PROJECTS_writeStore(PROJECTS_importNativeSnorlaxHistory(beforeImport, 'post-autoharvest'));
      PROJECTS_rerenderActivePageIfChanged(beforeImport, cached);
    }
    const projectsSection = DOM_findProjectsSection(DOM_findProjectsH2());
    const domRows = DOM_getNativeProjectRows(projectsSection, { overflowOnly: false });
    const openNativeRows = DOM_collectNativeProjectRows(D, { source: 'document' });
    if (!opts.forceRefresh && PROJECTS_storeHasRichBestSnapshot(cached)) {
      if (allowBackgroundRefresh) PROJECTS_scheduleRefresh('rich-best-page-open');
      return PROJECTS_pageRowsFromStore(cached, domRows, openNativeRows, projectsRaw);
    }
    if (!opts.forceRefresh && PROJECTS_isStoreFresh(cached)) {
      return PROJECTS_pageRowsFromStore(cached, domRows, openNativeRows, projectsRaw);
    }
    if (!opts.forceRefresh && PROJECTS_storeCanServeFromCache(cached) && cached.rows.length) {
      if (allowBackgroundRefresh) PROJECTS_scheduleRefresh('stale-page-open');
      return PROJECTS_pageRowsFromStore(cached, domRows, openNativeRows, projectsRaw);
    }

    const refreshed = await PROJECTS_refreshFullStore('page-open');
    const refreshedBestRows = PROJECTS_bestRows(refreshed);
    if (refreshed.complete && refreshedBestRows.length) {
      return PROJECTS_pageRowsFromStore(refreshed, domRows, openNativeRows, projectsRaw);
    }
    const primaryRows = refreshedBestRows.length ? refreshedBestRows : PROJECTS_bestRows(cached);
    return primaryRows.length
      ? PROJECTS_enrichRows(primaryRows, domRows, openNativeRows, projectsRaw)
      : PROJECTS_mergeRows(domRows, openNativeRows, projectsRaw);
  }

  function PROJECTS_loadRowsFast(projectsRaw = null) {
    const cached = PROJECTS_readStore();
    const projectsSection = DOM_findProjectsSection(DOM_findProjectsH2());
    const domRows = DOM_getNativeProjectRows(projectsSection, { overflowOnly: false });
    const rows = PROJECTS_pageRowsFromStore(cached, domRows, projectsRaw);
    return rows.length ? rows : PROJECTS_mergeRows(domRows, projectsRaw);
  }

  function PROJECTS_schedulePageReconcile(projectsRaw = null) {
    if (STATE.projectsDeferredLoadTimer) return;
    STATE.projectsDeferredLoadTimer = W.setTimeout(() => {
      const timer = STATE.projectsDeferredLoadTimer;
      STATE.projectsDeferredLoadTimer = 0;
      CLEAN.timers.delete(timer);
      if (!PROJECTS_isActivePage()) return;
      PROJECTS_loadRows(projectsRaw, { forceRefresh: false, backgroundRefresh: true })
        .then((rows) => {
          if (!PROJECTS_isActivePage()) return;
          const nextRows = PROJECTS_serializeRows(rows);
          const nextSig = PROJECTS_rowsSignature(nextRows);
          const activeSig = String(STATE.pageEl?.getAttribute?.('data-cgxui-project-row-signature') || '');
          const activeCount = Number(STATE.pageEl?.getAttribute?.('data-cgxui-project-row-count') || 0) || 0;
          if (nextRows.length && (activeSig !== nextSig || activeCount !== nextRows.length)) {
            owner.openViewer(nextRows, { skipHistory: true, useProvidedRows: true }).catch((error) => err('projectsDeferredPageOpen', error));
          }
        })
        .catch((error) => err('projectsDeferredReconcile', error));
    }, CFG_PROJECTS_DEFERRED_RECONCILE_MS);
    CLEAN.timers.add(STATE.projectsDeferredLoadTimer);
  }

  function UI_projectIconHtml(project) {
    const html = String(project?.iconHtml || '').trim();
    return html || FRAG_SVG_FOLDER;
  }

  function UI_wireProjectsPageScrollGuard(page, list) {
    const mark = () => {
      STATE.projectsPageScrollActiveUntil = Date.now() + 550;
    };
    for (const target of [page, list].filter(Boolean)) {
      target.addEventListener('wheel', mark, { passive: true });
      target.addEventListener('touchmove', mark, { passive: true });
      target.addEventListener('scroll', mark, { passive: true });
    }
  }

  function UI_appendInShellProjectRow(list, project, index = 0) {
    const li = D.createElement('li');

    const row = D.createElement('a');
    row.href = project.href || '#';
    row.draggable = false;
    row.className = 'flex w-full min-w-0 items-center gap-3';
    row.addEventListener('click', () => {
      W.setTimeout(() => UI_closeViewer(), 0);
    }, true);

    const rowIndex = D.createElement('span');
    rowIndex.setAttribute(ATTR_CGXUI_STATE, 'project-index');
    rowIndex.textContent = String(index + 1);
    row.appendChild(rowIndex);

    const icon = D.createElement('span');
    icon.setAttribute(ATTR_CGXUI_STATE, 'title-icon');
    icon.innerHTML = UI_projectIconHtml(project);
    row.appendChild(icon);

    const body = D.createElement('div');
    body.style.minWidth = '0';
    body.style.flex = '1 1 auto';

    const title = D.createElement('div');
    title.setAttribute(ATTR_CGXUI_STATE, 'row-title');
    title.textContent = project.title || project.href || 'Project';
    body.appendChild(title);

    row.appendChild(body);
    li.appendChild(row);
    list.appendChild(li);
  }

  function UI_appendInShellProjectRows(list, projects) {
    const rows = Array.isArray(projects) ? projects : [];
    const firstBatch = rows.slice(0, CFG_PROJECTS_RENDER_INITIAL_ROWS);
    firstBatch.forEach((project, index) => UI_appendInShellProjectRow(list, project, index));
    if (rows.length <= firstBatch.length) return;

    let index = firstBatch.length;
    const appendChunk = () => {
      if (!list.isConnected) return;
      const until = Math.min(index + CFG_PROJECTS_RENDER_CHUNK_ROWS, rows.length);
      for (; index < until; index += 1) UI_appendInShellProjectRow(list, rows[index], index);
      if (index < rows.length) {
        const timer = W.setTimeout(() => {
          CLEAN.timers.delete(timer);
          appendChunk();
        }, 0);
        CLEAN.timers.add(timer);
      }
    };
    const timer = W.setTimeout(() => {
      CLEAN.timers.delete(timer);
      appendChunk();
    }, 0);
    CLEAN.timers.add(timer);
  }

  function UI_setProjectsRefreshButtonState(btn, state = 'idle') {
    if (!(btn instanceof HTMLElement)) return;
    btn.disabled = state === 'loading';
    btn.setAttribute('data-cgxui-refresh-state', state);
    btn.textContent = state === 'loading'
      ? 'Refreshing'
      : state === 'done'
      ? 'Updated'
      : 'Refresh';
  }

  function UI_syncProjectsRefreshButtons(state = 'idle') {
    D.querySelectorAll('[data-cgxui-projects-refresh="1"]').forEach((btn) => {
      UI_setProjectsRefreshButtonState(btn, state);
    });
  }

  async function UI_handleProjectsManualRefresh(btn) {
    if (STATE.projectsManualRefreshRunning) return;
    STATE.projectsManualRefreshRunning = true;
    UI_setProjectsRefreshButtonState(btn, 'loading');
    UI_syncProjectsRefreshButtons('loading');
    let rows = [];
    try {
      const result = await TIME_withTimeout(
        PROJECTS_refreshFullStore('manual-page-refresh'),
        CFG_PROJECTS_MANUAL_REFRESH_TIMEOUT_MS,
        null
      );
      const store = result.value || PROJECTS_readStore();
      rows = PROJECTS_pageRowsFromStore(store);
      if (result.timedOut) {
        const fallback = PROJECTS_readStore();
        PROJECTS_writeStore({
          ...fallback,
          lastAttemptAt: Date.now(),
          error: `manual-refresh-timeout:${CFG_PROJECTS_MANUAL_REFRESH_TIMEOUT_MS}`,
        });
      }
    } catch (error) {
      err('projectsManualRefresh', error);
      rows = PROJECTS_pageRowsFromStore(PROJECTS_readStore());
    }

    STATE.projectsManualRefreshRunning = false;
    STATE.projectsManualRefreshDoneUntil = Date.now() + 1400;

    try {
      if (rows.length) await owner.openViewer(rows, { skipHistory: true, useProvidedRows: true });
    } catch (error) {
      err('projectsManualRefreshRender', error);
    } finally {
      UI_syncProjectsRefreshButtons('done');
      const timer = W.setTimeout(() => {
        if (!STATE.projectsManualRefreshRunning) UI_syncProjectsRefreshButtons('idle');
      }, 1400);
      CLEAN.timers.add(timer);
    }
  }

  async function UI_openProjectsViewer(projectsRaw = null, opts = {}) {
    STATE.projectsPageOpeningUntil = Date.now() + CFG_PROJECTS_STARTUP_RERENDER_DEFER_MS;

    let projects = opts.useProvidedRows === true && Array.isArray(projectsRaw)
      ? PROJECTS_serializeRows(projectsRaw)
      : opts.forceRefresh === true
      ? await PROJECTS_loadRows(projectsRaw, {
        forceRefresh: opts.forceRefresh === true,
        backgroundRefresh: opts.backgroundRefresh !== false && opts.forceRefresh === true,
      })
      : PROJECTS_loadRowsFast(projectsRaw);
    if (opts.routeToken && opts.routeToken !== STATE.pageRouteToken) return false;

    const liveProjects = PROJECTS_pageRowsFromStore(PROJECTS_readStore(), projects);
    if (liveProjects.length >= projects.length && PROJECTS_rowsSignature(liveProjects) !== PROJECTS_rowsSignature(projects)) {
      projects = liveProjects;
    }
    const projectsSignature = PROJECTS_rowsSignature(projects);
    const shell = UI_makeInShellPageShell('Projects', `${projects.length} projects`, 'Projects', {
      kind: 'projects',
      iconSvg: FRAG_SVG_FOLDER,
    });
    if (!shell?.page || !shell?.list) return false;
    shell.page.setAttribute('data-cgxui-project-row-count', String(projects.length));
    shell.page.setAttribute('data-cgxui-project-row-signature', projectsSignature);
    UI_appendInShellProjectRows(shell.list, projects);
    UI_wireProjectsPageScrollGuard(shell.page, shell.list);

    if (UI_mountInShellPage(shell.page)) {
      ROUTE_commitPageRoute({ view: 'projects', id: '' }, opts);
      if (opts.useProvidedRows !== true && opts.forceRefresh !== true && opts.deferReconcile !== false) {
        PROJECTS_schedulePageReconcile(projectsRaw);
      }
      return true;
    }
    return false;
  }

  function UI_applyProjectsNativeControls(projectsSection = DOM_findProjectsSection(DOM_findProjectsH2())) {
    if (!projectsSection) return;

    const moreRow = DOM_getProjectsMoreRow(projectsSection);
    if (moreRow && !moreRow.__h2oProjectsMoreBound) {
      const openProjectsPage = (e) => {
        if (STATE.projectsNativeHarvesting) return;
        if (getProjectMoreOpenMode() !== CFG_MORE_OPEN_MODE_PAGE) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        owner.openViewer(null).catch((error) => err('projectsMorePage', error));
      };
      const stopNativeProjectsMore = (e) => {
        if (STATE.projectsNativeHarvesting) return;
        if (getProjectMoreOpenMode() !== CFG_MORE_OPEN_MODE_PAGE) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
      };
      moreRow.addEventListener('pointerdown', stopNativeProjectsMore, true);
      moreRow.addEventListener('mousedown', stopNativeProjectsMore, true);
      moreRow.addEventListener('mouseup', stopNativeProjectsMore, true);
      moreRow.addEventListener('click', openProjectsPage, true);
      moreRow.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') openProjectsPage(e);
      }, true);
      moreRow.__h2oProjectsMoreBound = true;
    }

    if (projectsSection.__h2oProjectInlineBound) return;
    projectsSection.addEventListener('click', (e) => {
      if (getProjectInlinePreviewOnOpen()) return;
      const toggle = e.target?.closest?.('button[aria-label="Show chats"],button[aria-label="Hide chats"]');
      if (!toggle || !projectsSection.contains(toggle)) return;
      const row = toggle.closest('a.__menu-item[href*="/g/"][href$="/project"]');
      if (!row) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      W.setTimeout(() => row.click(), 0);
    }, true);
    projectsSection.__h2oProjectInlineBound = true;
  }

  function PROJECTS_eventTargetsMoreRow(e) {
    if (STATE.projectsNativeHarvesting) return null;
    if (getProjectMoreOpenMode() !== CFG_MORE_OPEN_MODE_PAGE) return null;
    const row = DOM_getProjectsMoreRow();
    if (!row || !e?.target || !row.contains(e.target)) return null;
    return row;
  }

  function PROJECTS_suppressNativeMoreEvent(e) {
    if (!PROJECTS_eventTargetsMoreRow(e)) return false;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    return true;
  }

  function PROJECTS_openMorePageFromEvent(e) {
    if (!PROJECTS_suppressNativeMoreEvent(e)) return;
    owner.openViewer(null).catch((error) => err('projectsMoreOverride', error));
  }

  function PROJECTS_fetchInputUrl(input) {
    if (!input) return '';
    if (typeof input === 'string') return input;
    try {
      if (input instanceof URL) return input.href;
    } catch {}
    return String(input.url || input.href || '');
  }

  function PROJECTS_isNativeSidebarUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return false;
    try {
      return new URL(raw, W.location?.origin || D.location?.origin || 'https://chatgpt.com').pathname === CFG_PROJECTS_TARGET_PATH;
    } catch {
      return raw.includes(CFG_PROJECTS_TARGET_PATH);
    }
  }

  function OBS_hookProjectsNativeFetchCaptureOnce() {
    if (STATE.projectsNativeFetchCaptureHooked) return;
    if (typeof W.fetch !== 'function') return;
    if (W.fetch.__h2oProjectsNativeFetchCapture) {
      STATE.projectsNativeFetchCaptureHooked = true;
      return;
    }
    STATE.projectsNativeFetchCaptureHooked = true;
    const originalFetch = W.fetch;

    function h2oProjectsNativeFetchCapture(input, init) {
      const url = PROJECTS_fetchInputUrl(input);
      const isNativeSidebar = PROJECTS_isNativeSidebarUrl(url);
      if (isNativeSidebar) PROJECTS_rememberObservedNativeHeaders(PROJECTS_observedHeadersFromFetchArgs(input, init));
      const result = originalFetch.apply(this, arguments);
      if (isNativeSidebar && result && typeof result.then === 'function') {
        result.then((res) => {
          if (!res?.ok) return;
          try {
            const copy = res.clone?.();
            copy?.json?.()
              .then((json) => PROJECTS_recordNativeSidebarPayload(json, 'native-fetch-observed'))
              .catch(() => {});
          } catch {}
        }).catch(() => {});
      }
      return result;
    }

    h2oProjectsNativeFetchCapture.__h2oProjectsNativeFetchCapture = true;
    h2oProjectsNativeFetchCapture.__h2oOriginalFetch = originalFetch;
    W.fetch = h2oProjectsNativeFetchCapture;
    CLEAN.listeners.add(() => {
      try {
        if (W.fetch === h2oProjectsNativeFetchCapture) W.fetch = originalFetch;
      } catch {}
    });
  }

  function OBS_hookProjectsMorePageOverrideOnce() {
    if (STATE.projectsMorePageOverrideHooked) return;
    STATE.projectsMorePageOverrideHooked = true;

    const stop = (e) => { PROJECTS_suppressNativeMoreEvent(e); };
    const open = (e) => { PROJECTS_openMorePageFromEvent(e); };
    const key = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      PROJECTS_openMorePageFromEvent(e);
    };

    for (const target of [W, D]) {
      for (const type of ['pointerdown', 'mousedown', 'mouseup', 'touchstart']) {
        TIME_addListener(
          () => target.addEventListener(type, stop, true),
          () => target.removeEventListener(type, stop, true)
        );
      }
      TIME_addListener(
        () => target.addEventListener('click', open, true),
        () => target.removeEventListener('click', open, true)
      );
      TIME_addListener(
        () => target.addEventListener('keydown', key, true),
        () => target.removeEventListener('keydown', key, true)
      );
    }
  }

  function OBS_hookProjectsCanonicalStoreOnce() {
    if (STATE.projectsCanonicalStoreHooked) return;
    STATE.projectsCanonicalStoreHooked = true;
    const root = D.body || D.documentElement;
    if (!root) return;

    const mo = new MutationObserver((muts) => {
      if (!PROJECTS_mutationTouchesNativeRows(muts)) return;
      PROJECTS_reconcileDropdownRows('native-dom-mutation');
      PROJECTS_invalidateStore('native-project-dom-mutation');
    });
    mo.observe(root, { childList: true, subtree: true });
    CLEAN.observers.add(() => { try { mo.disconnect(); } catch {} });
  }

  const owner = {
    phase: 'phase-6-projects-owner-finalized',
    openViewer(projectsRaw = null, opts = {}) { return UI_openProjectsViewer(projectsRaw, opts); },
    loadRows(projectsRaw = null, opts = {}) { return PROJECTS_loadRows(projectsRaw, opts); },
    loadRowsFast(projectsRaw = null) { return PROJECTS_loadRowsFast(projectsRaw); },
    schedulePageReconcile(projectsRaw = null) { return PROJECTS_schedulePageReconcile(projectsRaw); },
    refreshFullStore(reason = 'refresh') { return PROJECTS_refreshFullStore(reason); },
    reconcileDropdownRows(reason = 'dropdown') { return PROJECTS_reconcileDropdownRows(reason); },
    invalidateStore(reason = 'mutation') { return PROJECTS_invalidateStore(reason); },
    handleManualRefresh(btn) { return UI_handleProjectsManualRefresh(btn); },
    setRefreshButtonState(btn, state = 'idle') { return UI_setProjectsRefreshButtonState(btn, state); },
    applyNativeControls(projectsSection) { return UI_applyProjectsNativeControls(projectsSection); },
    eventTargetsMoreRow(e) { return PROJECTS_eventTargetsMoreRow(e); },
    suppressNativeMoreEvent(e) { return PROJECTS_suppressNativeMoreEvent(e); },
    openMorePageFromEvent(e) { return PROJECTS_openMorePageFromEvent(e); },
    hookNativeFetchCaptureOnce() { return OBS_hookProjectsNativeFetchCaptureOnce(); },
    hookMorePageOverrideOnce() { return OBS_hookProjectsMorePageOverrideOnce(); },
    hookCanonicalStoreOnce() { return OBS_hookProjectsCanonicalStoreOnce(); },
    mutationTouchesNativeRows(muts) { return PROJECTS_mutationTouchesNativeRows(muts); },
  };

  function PROJECTS_boot() {
    if (STATE.projectsBooted) return;
    STATE.projectsBooted = true;
    OBS_hookProjectsNativeFetchCaptureOnce();
    OBS_hookProjectsMorePageOverrideOnce();
    OBS_hookProjectsCanonicalStoreOnce();
    step('boot');
  }

  MOD.owner = owner;
  MOD.refresh = (...args) => owner.refreshFullStore(...args);
  MOD.openViewer = (...args) => owner.openViewer(...args);
  MOD.readStore = PROJECTS_readStore;

  try {
    core.registerOwner?.('projects', owner, { replace: true });
    core.registerService?.('projects', owner, { replace: true });
    core.registerRoute?.('projects', async (route) => {
      const handled = await owner.openViewer(null, {
        fromRoute: true,
        baseHref: route?.baseHref,
        routeToken: route?.routeToken,
      });
      return handled !== false;
    }, { replace: true });
    step('projects-owner-registered');
  } catch (error) {
    err('register-projects-owner', error);
  }

  PROJECTS_boot();
})();
