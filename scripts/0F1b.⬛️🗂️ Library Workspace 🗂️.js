// ==UserScript==
// @h2o-id             0f1b.library_workspace
// @name               0F1b.⬛️🗂️ Library Workspace 🗂️
// @namespace          H2O.Premium.CGX.library_workspace
// @author             HumamDev
// @version            1.3.2
// @revision           012
// @build              260426-000005
// @description        Library Workspace: top-level Library sidebar button, objective Dashboard workspace page, Library Index-first read model, saved/recent/known chat views, source status, Insights delegation, and flicker-safe sidebar layout API.
// @match       https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /*
   * 0F1b — Library Workspace (product surface / aggregator, NOT core infra)
   *
   * OWNS:
   *   - Top-level Library sidebar button.
   *   - Library route + Library workspace/page UI.
   *   - Read-only Library workspace/page UI over the canonical Library Index model.
   *   - Search/filter/view-mode UI state for the Library page.
   *   - Diagnostics/self-check for the Library workspace surface.
   *
   * MUST NOT OWN:
   *   - LibraryCore services/registries (0F1a).
   *   - Folder data or folder bindings (0F3a / H2O.folders).
   *   - Native projects fetch/cache/reconcile (0F2a / H2O.Projects).
   *   - Category catalog/grouping (0F4a / H2O.Categories).
   *   - Turn-level tags/keywords/title-bar tag UI (0F5a / H2O.Tags).
   *   - Chat-level label catalog/bindings (0F6a / H2O.Labels).
   *   - Archive/workbench truth (0D3a / H2O.archiveBoot).
   *
   * DESIGN CONTRACT:
   *   This module is a read-only product workspace. Its normal read model is 0F1c Library Index.
   *   Direct owner/source reads are degraded fallback only when Library Index is unavailable or broken.
   *   It renders a combined Library experience and avoids direct mutation of domain state.
   */

  const W = window;
  const D = document;
  const H2O = (W.H2O = W.H2O || {});

  const BOOT_LOCK = '__h2oLibraryWorkspaceBooted_v1_0_0';
  const BOOT_TIMER_SET = '__h2oLibraryWorkspaceBootTimers_v1_0_0';
  const BOOT_MAX_ATTEMPTS = 180;

  function bootWhenLibraryCoreReady(attempt = 0) {
    const core = H2O.LibraryCore;
    if (!core) {
      if (attempt >= BOOT_MAX_ATTEMPTS) {
        try {
          H2O.LibraryWorkspaceBootDiag = {
            ok: false,
            status: 'library-core-not-found',
            attempts: attempt,
            ts: Date.now(),
          };
        } catch {}
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

    try {
      H2O.LibraryWorkspaceBootDiag = {
        ok: true,
        status: 'library-core-ready',
        attempts: attempt,
        ts: Date.now(),
      };
    } catch {}
    runLibraryWorkspace(core);
  }

  function runLibraryWorkspace(core) {
    if (H2O[BOOT_LOCK]) return;
    H2O[BOOT_LOCK] = true;

    const MOD = (H2O.LibraryWorkspace = H2O.LibraryWorkspace || {});
    MOD.meta = MOD.meta || {
      owner: '0F1b.library_workspace',
      label: 'Library Workspace',
      phase: 'phase-7-index-first-workspace-model',
      suite: 'prm',
      host: 'cgx',
    };
    MOD.meta.phase = 'phase-7-index-first-workspace-model';

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

    const TOK = 'LW';
    const PID = 'library';
    const SkID = 'lwsc';
    const MODTAG = 'Library';
    const SUITE = 'prm';
    const HOST = 'cgx';
    const DsID = PID;

    const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;
    const KEY_UI_V1 = `${NS_DISK}:ui:v1`;
    const KEY_SIDEBAR_LAYOUT_V1 = 'h2o:prm:cgx:library-workspace:sidebar-layout:v1';

    const ATTR_CGXUI = 'data-cgxui';
    const ATTR_CGXUI_OWNER = 'data-cgxui-owner';
    const ATTR_CGXUI_STATE = 'data-cgxui-state';
    const ATTR_CGXUI_MODE = 'data-cgxui-mode';
    const ATTR_CGXUI_PAGE_HIDDEN = 'data-cgxui-page-hidden-by';

    const UI_LIBRARY_ROOT = `${SkID}-root`;
    const UI_LIBRARY_ROW = `${SkID}-row`;
    const UI_LIBRARY_TOP_BUTTON = `${SkID}-top-library-button`;
    const UI_LIBRARY_TOP_BUTTON_LEGACY = `${SkID}-top-button`;
    const UI_LIBRARY_RAIL_BUTTON = `${SkID}-rail-library-button`;
    const UI_LIBRARY_PAGE_HOST = `${SkID}-page-host`;
    const UI_LIBRARY_PAGE = `${SkID}-page`;
    const UI_LIBRARY_VIEWER = `${SkID}-viewer`;
    const UI_LIBRARY_ICON_SLOT = `${SkID}-ico-slot`;
    const UI_LIBRARY_TOP_ICON_SLOT = `${SkID}-top-ico-slot`;
    const UI_LIBRARY_RAIL_ICON_SLOT = `${SkID}-rail-ico-slot`;
    const CSS_STYLE_ID = `cgxui-${SkID}-style`;

    // Route constants intentionally use the existing 0F route contract (flsc), not lwsc.
    // SkID remains lwsc for DOM/CSS ownership; route contract remains shared through LibraryCore.
    const CFG_H2O_PAGE_ROUTE_OWNER = 'flsc:page-route:v1';
    const CFG_H2O_PAGE_ROUTE_PREFIX = 'h2o';
    const CFG_H2O_PAGE_QUERY_FLAG = 'h2o_flsc';
    const CFG_H2O_PAGE_QUERY_VIEW = 'h2o_flsc_view';
    const CFG_H2O_PAGE_QUERY_ID = 'h2o_flsc_id';

    const CFG_FLOATING_Z = 2147483647;
    const CFG_CHAT_PREVIEW_LIMIT = 160;
    const CFG_SEARCH_DEBOUNCE_MS = 80;

    const FRAG_SVG_LIBRARY = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13A2.5 2.5 0 0 1 17.5 21h-11A2.5 2.5 0 0 1 4 18.5v-13Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M8 7h8M8 11h8M8 15h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    `;

    const FRAG_SVG_REFRESH = `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.35-5.65M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    `;

    const SEL = {
      projectsLabelH2: 'h2.__menu-label',
      projectsSectionA: 'div.group\\/sidebar-expando-section',
      projectsSectionB: 'div[class*="sidebar-expando-section"]',
      sidebarItemAnchor: 'a.__menu-item[href]',
      sidebarItemDiv: 'div.__menu-item',
      sidebarItemAny: '.__menu-item',
      sidebarTruncate: '.truncate,[class*="truncate"]',
      currentChatAnchor: 'a[aria-current="page"][href*="/c/"]',
      nav: 'nav',
      aside: 'aside',
    };

    const TABS = Object.freeze([
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'explorer', label: 'Explorer' },
      { key: 'analytics', label: 'Analytics' },
      { key: 'saved', label: 'Saved' },
      { key: 'recent', label: 'Recent' },
      { key: 'folders', label: 'Folders' },
      { key: 'labels', label: 'Labels' },
      { key: 'categories', label: 'Categories' },
      { key: 'projects', label: 'Projects' },
      { key: 'organize', label: 'Organize' },
    ]);

    const SIDEBAR_SECTIONS = Object.freeze([
      { id: 'library', label: 'Library', defaultOrder: 10 },
      { id: 'labels', label: 'Labels', defaultOrder: 20 },
      { id: 'folders', label: 'Folders', defaultOrder: 30 },
      { id: 'categories', label: 'Categories', defaultOrder: 40 },
      { id: 'projects', label: 'Projects', defaultOrder: 50 },
      { id: 'recents', label: 'Recents', defaultOrder: 60, native: true },
    ]);

    const SIDEBAR_SECTIONS_BY_ID = Object.freeze(SIDEBAR_SECTIONS.reduce((acc, item) => { acc[item.id] = item; return acc; }, Object.create(null)));
    const SIDEBAR_PREPAINT_SECTIONS = Object.freeze({
      labels: { id: 'labels', token: 'lbsc-root', owner: 'lbsc', label: 'Labels' },
      folders: { id: 'folders', token: 'flsc-root', owner: 'flsc', label: 'Folders' },
      categories: { id: 'categories', token: 'flsc-categories-root', owner: 'flsc', label: 'Categories' },
    });
    const EV_SIDEBAR_LAYOUT_CHANGED = 'evt:h2o:library-workspace:sidebar-layout-changed';

    const state = (MOD.state = MOD.state || {
      booted: false,
      sidebarMO: null,
      observedRoot: null,
      ensureTimer: 0,
      sidebarLayoutTimer: 0,
      searchTimer: 0,
      building: false,
      suppressMO: false,
      pageEl: null,
      pageHost: null,
      pageSession: null,
      pageHiddenRecords: [],
      pageRoute: null,
      pageRouteToken: 0,
      pageSeq: 0,
      viewerEl: null,
      model: null,
      loading: false,
      lastModelSource: '',
      lastDegradedReason: '',
      lastIndexFailureReason: '',
      hasLibraryIndex: false,
      indexModelFresh: false,
      sidebarRenderCount: 0,
      sidebarEnsureCount: 0,
      sidebarActiveSyncCount: 0,
      libraryActiveSyncCount: 0,
      lastLibraryActiveSyncReason: '',
      lastLibraryActiveSyncAt: 0,
      libraryActiveSyncTimer: 0,
      libraryActiveSyncDelayTimer: 0,
      nativeActiveRowsClearedLastCount: 0,
      sidebarSkippedH2OMutations: 0,
      sidebarActiveSyncTimer: 0,
      lastSidebarRenderReason: '',
      lastSidebarEnsureReason: '',
      lastSidebarActiveSyncReason: '',
      sidebarLastRenderReason: '',
      sidebarLastEnsureReason: '',
      sidebarLastActiveSyncReason: '',
      sidebarLastRenderAt: 0,
      sidebarLastEnsureAt: 0,
      sidebarLastActiveSyncAt: 0,
      topLibraryButtonRenderCount: 0,
      topLibraryButtonActiveSyncCount: 0,
      topLibraryButtonLastReason: '',
      lastTopButtonEnsureReason: '',
      topLibraryButtonSkippedH2OMutations: 0,
      cleanedContaminatedTopButtonMarkersCount: 0,
      topLibraryButtonInsertAttempted: false,
      topLibraryButtonInsertFailedReason: '',
      railLibraryButtonRenderCount: 0,
      railLibraryButtonActiveSyncCount: 0,
      railLibraryButtonLastReason: '',
      lastRailButtonEnsureReason: '',
      railLibraryButtonInsertAttempted: false,
      railLibraryButtonInsertFailedReason: '',
      firstSidebarShellAt: 0,
      firstTopLibraryButtonAt: 0,
      firstFoldersShellAt: 0,
      firstLabelsShellAt: 0,
      firstCategoriesShellAt: 0,
      sidebarShellRenderCount: 0,
      sidebarHydrationCount: 0,
      sidebarHydrationLastReason: '',
      sidebarShellSkippedDuplicateCount: 0,
      sidebarShellMode: '',
      sidebarPrepaintStable: false,
      sidebarPrepaintObserver: null,
      sidebarPrepaintObservedRoot: null,
      sidebarPrepaintTimers: [],
      routeEventsBound: false,
      indexUpdateListenerBound: false,
      indexUpdateTimer: 0,
      clean: { timers: new Set(), listeners: new Set(), observers: new Set(), nodes: new Set() },
    });

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

    function normText(raw = '') {
      return String(raw || '').trim().replace(/\s+/g, ' ');
    }

    function lowerText(raw = '') {
      return normText(raw).toLowerCase();
    }

    function escapeHtml(raw = '') {
      return String(raw || '').replace(/[&<>"']/g, (m) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[m]));
    }

    function cssEscape(raw = '') {
      const value = String(raw || '');
      try { return CSS.escape(value); } catch { return value.replace(/[^a-z0-9_-]/gi, '\\$&'); }
    }

    function safeRemove(node) {
      try { node?.remove?.(); } catch {}
    }

    function safeDispatch(name, detail = {}) {
      try { W.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
    }

    function utilSelScoped(token) {
      return `[${ATTR_CGXUI}="${token}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;
    }

    function ownerScopedSelector(token, owner) {
      return `[${ATTR_CGXUI}="${cssEscape(token)}"][${ATTR_CGXUI_OWNER}="${cssEscape(owner)}"]`;
    }

    function topLibraryButtonSelector() {
      return utilSelScoped(UI_LIBRARY_TOP_BUTTON);
    }

    function railLibraryButtonSelector() {
      return utilSelScoped(UI_LIBRARY_RAIL_BUTTON);
    }

    function normalizeTabKey(raw = '') {
      const key = String(raw || '').trim();
      // Backward compatibility for v1.1.4 UI storage.
      if (key === 'overview') return 'dashboard';
      if (key === 'chats') return 'saved';
      return TABS.some((item) => item.key === key) ? key : 'dashboard';
    }

    function readUi() {
      const raw = storage.getJSON(KEY_UI_V1, null);
      const src = raw && typeof raw === 'object' ? raw : {};
      const tab = normalizeTabKey(src.tab);
      return {
        tab,
        query: String(src.query || ''),
        viewMode: src.viewMode === 'grid' ? 'grid' : 'list',
      };
    }

    function writeUi(patch = {}) {
      const next = { ...readUi(), ...(patch && typeof patch === 'object' ? patch : {}) };
      next.tab = normalizeTabKey(next.tab);
      next.query = String(next.query || '');
      next.viewMode = next.viewMode === 'grid' ? 'grid' : 'list';
      storage.setJSON(KEY_UI_V1, next);
      return next;
    }

    function defaultSidebarLayout() {
      const sections = Object.create(null);
      SIDEBAR_SECTIONS.forEach((item) => {
        sections[item.id] = { visible: true, order: item.defaultOrder };
      });
      return { sections, updatedAt: 0 };
    }

    function normalizeSidebarLayout(raw) {
      const src = raw && typeof raw === 'object' ? raw : {};
      const inSections = src.sections && typeof src.sections === 'object' ? src.sections : {};
      const out = defaultSidebarLayout();
      SIDEBAR_SECTIONS.forEach((item) => {
        const row = inSections[item.id] && typeof inSections[item.id] === 'object' ? inSections[item.id] : {};
        const n = Number(row.order);
        out.sections[item.id] = {
          visible: row.visible !== false,
          order: Number.isFinite(n) ? n : item.defaultOrder,
        };
      });
      out.updatedAt = Number.isFinite(Number(src.updatedAt)) ? Number(src.updatedAt) : 0;
      const ordered = getOrderedSidebarSectionIds(out);
      ordered.forEach((id, idx) => { out.sections[id].order = (idx + 1) * 10; });
      return out;
    }

    function getSidebarLayout() {
      return normalizeSidebarLayout(storage.getJSON(KEY_SIDEBAR_LAYOUT_V1, null));
    }

    function writeSidebarLayout(nextRaw) {
      const next = normalizeSidebarLayout({ ...(nextRaw || {}), updatedAt: Date.now() });
      storage.setJSON(KEY_SIDEBAR_LAYOUT_V1, next);
      safeDispatch(EV_SIDEBAR_LAYOUT_CHANGED, { layout: next, ts: Date.now() });
      return next;
    }

    function getOrderedSidebarSectionIds(layoutRaw = getSidebarLayout()) {
      const layout = layoutRaw && layoutRaw.sections ? layoutRaw : normalizeSidebarLayout(layoutRaw);
      return SIDEBAR_SECTIONS.slice()
        .sort((a, b) => {
          const ao = Number(layout.sections?.[a.id]?.order);
          const bo = Number(layout.sections?.[b.id]?.order);
          const ai = Number.isFinite(ao) ? ao : a.defaultOrder;
          const bi = Number.isFinite(bo) ? bo : b.defaultOrder;
          return (ai - bi) || (a.defaultOrder - b.defaultOrder);
        })
        .map((item) => item.id);
    }

    function setSidebarSectionVisible(sectionIdRaw, visible = true) {
      const id = String(sectionIdRaw || '').trim();
      if (!SIDEBAR_SECTIONS_BY_ID[id]) return getSidebarLayout();
      const layout = getSidebarLayout();
      layout.sections[id].visible = visible !== false;
      const next = writeSidebarLayout(layout);
      scheduleSidebarLayoutApply('set-visible');
      return next;
    }

    function setSidebarOrder(sectionIdsRaw = []) {
      const incoming = Array.isArray(sectionIdsRaw) ? sectionIdsRaw.map((id) => String(id || '').trim()).filter(Boolean) : [];
      const seen = new Set();
      const ordered = [];
      incoming.forEach((id) => {
        if (!SIDEBAR_SECTIONS_BY_ID[id] || seen.has(id)) return;
        seen.add(id);
        ordered.push(id);
      });
      SIDEBAR_SECTIONS.forEach((item) => {
        if (seen.has(item.id)) return;
        seen.add(item.id);
        ordered.push(item.id);
      });
      const layout = getSidebarLayout();
      ordered.forEach((id, idx) => { layout.sections[id].order = (idx + 1) * 10; });
      const next = writeSidebarLayout(layout);
      scheduleSidebarLayoutApply('set-order');
      return next;
    }

    function moveSidebarSection(sectionIdRaw, directionRaw = 'up') {
      const id = String(sectionIdRaw || '').trim();
      if (!SIDEBAR_SECTIONS_BY_ID[id]) return getSidebarLayout();
      const order = getOrderedSidebarSectionIds(getSidebarLayout());
      const idx = order.indexOf(id);
      if (idx < 0) return getSidebarLayout();
      const dir = String(directionRaw || '').toLowerCase();
      const delta = dir === 'down' || dir === 'later' || dir === 'next' ? 1 : -1;
      const nextIdx = Math.max(0, Math.min(order.length - 1, idx + delta));
      if (idx === nextIdx) return getSidebarLayout();
      const [item] = order.splice(idx, 1);
      order.splice(nextIdx, 0, item);
      return setSidebarOrder(order);
    }

    function resetSidebarLayout() {
      const next = writeSidebarLayout(defaultSidebarLayout());
      scheduleSidebarLayoutApply('reset');
      return next;
    }

    function resetWorkspaceUiPrefs() {
      const next = writeUi({ tab: 'dashboard', query: '', viewMode: 'list' });
      if (state.pageEl?.isConnected) renderWorkspaceBody();
      return next;
    }

    function getRouteService() {
      return core.getService?.('route') || null;
    }

    function getPageHostService() {
      return core.getService?.('page-host') || null;
    }

    function getNativeSidebarService() {
      return core.getService?.('native-sidebar') || null;
    }

    function mutationHasOnlyH2OOwnedNodes(muts) {
      try {
        return !!getNativeSidebarService()?.mutationHasOnlyH2OOwnedNodes?.(muts);
      } catch {
        return false;
      }
    }

    function getOwnerOrService(name) {
      return core.getService?.(name) || core.getOwner?.(name) || H2O?.[name?.[0]?.toUpperCase?.() + String(name || '').slice(1)] || null;
    }

    function DOM_hasClassTokens(el, tokens) {
      const cls = String(el?.className || '');
      return tokens.every((token) => cls.split(/\s+/).includes(token));
    }

    function DOM_isScrollPageHost(el) {
      if (!(el instanceof HTMLElement)) return false;
      const cls = String(el.className || '');
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

      const thread = D.getElementById('thread');
      const composer = thread?.parentElement || null;
      const shell = composer?.parentElement || null;
      if (shell instanceof HTMLElement && DOM_hasClassTokens(shell, ['relative', 'grow', 'grid'])) return shell;
      if (composer instanceof HTMLElement && (
        String(composer.className || '').includes('composer-parent') ||
        composer.getAttribute('role') === 'presentation'
      )) return composer;
      if (thread instanceof HTMLElement) return thread;
      return null;
    }

    function libraryEnv() {
      return {
        W,
        D,
        H2O,
        STATE: state,
        CLEAN: state.clean,
        SAFE_remove: safeRemove,
        ATTR_CGXUI,
        ATTR_CGXUI_OWNER,
        ATTR_CGXUI_STATE,
        ATTR_CGXUI_MODE,
        ATTR_CGXUI_PAGE_HIDDEN,
        UI_FSECTION_VIEWER: UI_LIBRARY_VIEWER,
        UI_FSECTION_PAGE_HOST: UI_LIBRARY_PAGE_HOST,
        UI_FSECTION_PAGE: UI_LIBRARY_PAGE,
        CFG_H2O_PAGE_ROUTE_OWNER,
        CFG_H2O_PAGE_ROUTE_PREFIX,
        CFG_H2O_PAGE_QUERY_FLAG,
        CFG_H2O_PAGE_QUERY_VIEW,
        CFG_H2O_PAGE_QUERY_ID,
        SkID,
        FRAG_SVG_CATEGORY: FRAG_SVG_LIBRARY,
        FRAG_SVG_FOLDER: FRAG_SVG_LIBRARY,
        DOM_resolveRightPanePageHost,
      };
    }

    function nativeSidebarEnv() {
      return {
        D,
        normalizeText: normText,
        projectsLabelSelector: SEL.projectsLabelH2,
        projectsSectionSelectors: [SEL.projectsSectionA, SEL.projectsSectionB],
        sidebarItemSelector: SEL.sidebarItemAny,
        moreLabel: 'More',
      };
    }

    function findProjectsH2() {
      const viaSvc = getNativeSidebarService()?.findProjectsH2?.(nativeSidebarEnv());
      if (viaSvc) return viaSvc;
      return [...D.querySelectorAll(SEL.projectsLabelH2)].find((el) => /projects/i.test(normText(el.textContent || ''))) || null;
    }

    function findProjectsSection(h2 = findProjectsH2()) {
      if (!h2) return null;
      const viaSvc = getNativeSidebarService()?.findProjectsSection?.(nativeSidebarEnv(), h2);
      if (viaSvc) return viaSvc;
      const btn = h2.closest('button');
      return btn?.closest?.(SEL.projectsSectionA) || btn?.closest?.(SEL.projectsSectionB) || null;
    }

    function pickSidebarRoot(fromEl) {
      return fromEl?.closest?.(SEL.nav) || fromEl?.closest?.(SEL.aside) || fromEl?.parentElement || D.body;
    }

    function pickSidebarObserverRoot(fromEl) {
      return fromEl?.closest?.('#stage-slideover-sidebar') || pickSidebarRoot(fromEl);
    }

    function findLabelsRoot() {
      return D.querySelector('[data-cgxui="lbsc-root"][data-cgxui-owner="lbsc"]');
    }

    function findFoldersRoot() {
      return D.querySelector('[data-cgxui="flsc-root"][data-cgxui-owner="flsc"]');
    }

    function findCategoriesRoot() {
      return D.querySelector('[data-cgxui="flsc-categories-root"][data-cgxui-owner="flsc"]');
    }

    function findPrepaintOwnedRoot(sectionId, root = null) {
      const spec = SIDEBAR_PREPAINT_SECTIONS[String(sectionId || '')];
      if (!spec) return null;
      const base = root && typeof root.querySelector === 'function' ? root : D;
      try {
        const viaSvc = getNativeSidebarService()?.findOwnedRoot?.(spec.token, spec.owner, base);
        if (viaSvc instanceof HTMLElement) return viaSvc;
      } catch {}
      try {
        const node = base.querySelector(ownerScopedSelector(spec.token, spec.owner));
        return node instanceof HTMLElement ? node : null;
      } catch {
        return null;
      }
    }

    function getPrepaintInsertionTarget() {
      const svc = getNativeSidebarService();
      try {
        const target = svc?.findPrepaintInsertionTarget?.(nativeSidebarEnv());
        if (target?.parent instanceof HTMLElement) return target;
      } catch {}
      const projectsSection = findProjectsSection(findProjectsH2());
      if (projectsSection?.parentElement) {
        return { parent: projectsSection.parentElement, beforeNode: projectsSection, anchor: projectsSection, nav: projectsSection.closest?.('nav') || null, reason: '' };
      }
      const top = topButtonInsertionTarget();
      const nav = top.parent?.closest?.('nav') || null;
      if (nav instanceof HTMLElement) {
        const topBlock = svc?.closestDirectChild?.(nav, top.parent) || top.parent?.parentElement || null;
        return { parent: nav, beforeNode: topBlock?.nextElementSibling || null, anchor: topBlock || nav.lastElementChild || null, nav, reason: '' };
      }
      return { parent: null, beforeNode: null, anchor: null, nav: null, reason: 'prepaint-anchor-not-found' };
    }

    function findNativeHeaderSection(labelRe) {
      try {
        const headers = [...D.querySelectorAll(SEL.projectsLabelH2)];
        const h2 = headers.find((el) => labelRe.test(normText(el.textContent || '')));
        if (!h2) return null;
        const btn = h2.closest('button');
        return btn?.closest?.(SEL.projectsSectionA) || btn?.closest?.(SEL.projectsSectionB) || btn?.parentElement || h2.parentElement || null;
      } catch {
        return null;
      }
    }

    function findRecentsSection() {
      return findNativeHeaderSection(/^recents?\b/i);
    }

    function findSidebarSectionNode(sectionId) {
      switch (String(sectionId || '')) {
        case 'library': return D.querySelector(utilSelScoped(UI_LIBRARY_ROOT));
        case 'labels': return findLabelsRoot();
        case 'folders': return findFoldersRoot();
        case 'categories': return findCategoriesRoot();
        case 'projects': return findProjectsSection(findProjectsH2());
        case 'recents': return findRecentsSection();
        default: return null;
      }
    }

    function collectSidebarSectionRecords(layoutRaw = getSidebarLayout()) {
      const layout = normalizeSidebarLayout(layoutRaw);
      return getOrderedSidebarSectionIds(layout).map((id) => ({
        id,
        meta: SIDEBAR_SECTIONS_BY_ID[id],
        config: layout.sections[id],
        node: findSidebarSectionNode(id),
      }));
    }

    function applyNodeVisibility(node, visible) {
      if (!(node instanceof HTMLElement)) return;
      try {
        if (visible) {
          if (node.getAttribute('data-h2o-library-hidden-by-layout') === '1') node.style.display = '';
          node.removeAttribute('data-h2o-library-hidden-by-layout');
          node.removeAttribute('aria-hidden');
        } else {
          node.setAttribute('data-h2o-library-hidden-by-layout', '1');
          node.setAttribute('aria-hidden', 'true');
          node.style.display = 'none';
        }
      } catch {}
    }

    function pickLayoutParent(records) {
      const counts = new Map();
      records.forEach((record) => {
        const parent = record.node?.parentElement;
        if (!parent) return;
        counts.set(parent, (counts.get(parent) || 0) + 1);
      });
      let best = null;
      let bestCount = 0;
      counts.forEach((count, parent) => {
        if (count > bestCount) { best = parent; bestCount = count; }
      });
      return best;
    }

    function isLikelySidebarAccountNode(node, managedSet) {
      if (!(node instanceof HTMLElement) || managedSet?.has?.(node)) return false;
      if (node.closest?.('[role="dialog"],[data-radix-popper-content-wrapper]')) return false;
      const text = lowerText(node.textContent || '');
      const hasPlanText = /\b(plus|pro|team|enterprise|free)\b/.test(text);
      const hasProfileSignal = !!node.querySelector?.('img, [data-testid*="profile"], [data-testid*="account"], [data-testid*="user"], [aria-label*="profile" i], [aria-label*="account" i], [aria-label*="user" i]');
      const hasAccountTestId = /profile|account|user/i.test(String(node.getAttribute('data-testid') || ''));
      return hasPlanText || hasProfileSignal || hasAccountTestId;
    }

    function isLikelySidebarSpacerNode(node, managedSet) {
      if (!(node instanceof HTMLElement) || managedSet?.has?.(node)) return false;
      if (node.closest?.('[role="dialog"],[data-radix-popper-content-wrapper]')) return false;
      if (isLikelySidebarAccountNode(node, managedSet)) return false;
      // ChatGPT's sidebar often uses an empty/flex-grow spacer to pin the account footer
      // to the bottom. When managed Library sections get positive CSS order values,
      // that spacer remains at order:0 and creates a growing blank gap before Library.
      // Protect it by ordering it after the managed sections, not before them.
      const text = normText(node.textContent || '');
      const hasInteractive = !!node.querySelector?.('a,button,[role="button"],[role="link"],input,select,textarea');
      if (text || hasInteractive) return false;
      let flexGrow = 0;
      let display = '';
      try {
        const cs = W.getComputedStyle?.(node);
        flexGrow = Number.parseFloat(cs?.flexGrow || node.style.flexGrow || '0') || 0;
        display = String(cs?.display || '').toLowerCase();
      } catch {}
      let height = 0;
      try { height = Number(node.getBoundingClientRect?.().height || 0) || 0; } catch {}
      const cls = String(node.className || '');
      const hasGrowClass = /(?:^|\s)(grow|flex-1|basis-0|min-h-0)(?:\s|$)/.test(cls);
      const looksFlexItem = display === 'block' || display === 'flex' || display === 'grid' || display === '';
      return looksFlexItem && (flexGrow > 0 || hasGrowClass || height > 48);
    }

    function protectSidebarStructuralSiblings(records) {
      // CSS order is visual-only, but unordered siblings keep order:0.
      // In ChatGPT's sidebar, both the account/profile footer and its flexible spacer can
      // share the same flex parent as injected organization sections. If sections get
      // positive order values without protecting those siblings:
      //   - the account row can jump above the sections;
      //   - the flex spacer can create a large blank gap before the first section.
      // Keep native top rows at order 0, managed library sections at 10..N,
      // spacer near the bottom, and account footer last.
      const nodes = (Array.isArray(records) ? records : [])
        .map((record) => record?.node)
        .filter((node) => node instanceof HTMLElement);
      if (!nodes.length) return { footers: 0, spacers: 0 };

      const managed = new Set(nodes);
      const parents = [...new Set(nodes.map((node) => node.parentElement).filter(Boolean))];
      let footers = 0;
      let spacers = 0;

      parents.forEach((parent) => {
        [...parent.children].forEach((child) => {
          if (!(child instanceof HTMLElement) || managed.has(child)) return;
          try {
            if (isLikelySidebarAccountNode(child, managed)) {
              if (!child.hasAttribute('data-h2o-library-prev-order')) {
                child.setAttribute('data-h2o-library-prev-order', child.style.order || '');
              }
              child.style.order = '9000';
              child.setAttribute('data-h2o-library-footer-order-guard', '9000');
              footers += 1;
              return;
            }
            if (isLikelySidebarSpacerNode(child, managed)) {
              if (!child.hasAttribute('data-h2o-library-prev-order')) {
                child.setAttribute('data-h2o-library-prev-order', child.style.order || '');
              }
              child.style.order = '8990';
              child.setAttribute('data-h2o-library-spacer-order-guard', '8990');
              spacers += 1;
            }
          } catch {}
        });
      });

      return { footers, spacers };
    }

    function applySidebarOrderStyles(records) {
      // IMPORTANT: do not physically move these section nodes.
      // 0F3a/0F6a/native ChatGPT observers also maintain their own placement invariants.
      // DOM insertBefore() here can cause an authority fight: one owner moves a section,
      // another owner restores it, then scheduled layout retries move it again -> flicker.
      // Using CSS order keeps the visual order user-configurable while preserving DOM ownership.
      let applied = 0;
      (Array.isArray(records) ? records : []).forEach((record, idx) => {
        const node = record?.node;
        if (!(node instanceof HTMLElement)) return;
        try {
          node.style.order = String((idx + 1) * 10);
          node.setAttribute('data-h2o-library-order-by-layout', String((idx + 1) * 10));
          applied += 1;
        } catch {}
      });
      const protectedSiblings = protectSidebarStructuralSiblings(records);
      if (protectedSiblings.footers) step('sidebar-footer-order-guard', String(protectedSiblings.footers));
      if (protectedSiblings.spacers) step('sidebar-spacer-order-guard', String(protectedSiblings.spacers));
      return applied > 0;
    }

    function applySidebarLayout(reason = 'api') {
      const layout = getSidebarLayout();
      const records = collectSidebarSectionRecords(layout);
      state.suppressMO = true;
      try {
        const ordered = applySidebarOrderStyles(records);
        records.forEach((record) => applyNodeVisibility(record.node, record.config?.visible !== false));
        syncSidebarActiveState();
        step('sidebar-layout-applied', String(reason || 'api') + (ordered ? ':css-order' : ':no-order'));
      } catch (error) {
        err('apply-sidebar-layout', error);
      } finally {
        state.suppressMO = false;
      }
      return getSidebarLayoutDiagnostics(layout);
    }

    function scheduleSidebarLayoutApply(reason = 'schedule') {
      // Single debounced apply prevents reorder-timer bursts from fighting sidebar owners.
      if (state.sidebarLayoutTimer) {
        try { W.clearTimeout(state.sidebarLayoutTimer); } catch {}
        try { state.clean.timers.delete(state.sidebarLayoutTimer); } catch {}
      }
      state.sidebarLayoutTimer = W.setTimeout(() => {
        const timer = state.sidebarLayoutTimer;
        state.sidebarLayoutTimer = 0;
        try { state.clean.timers.delete(timer); } catch {}
        applySidebarLayout(reason);
      }, 40);
      state.clean.timers.add(state.sidebarLayoutTimer);
    }

    function getSidebarLayoutDiagnostics(layoutRaw = getSidebarLayout()) {
      const layout = normalizeSidebarLayout(layoutRaw);
      const records = collectSidebarSectionRecords(layout);
      return {
        storageKey: KEY_SIDEBAR_LAYOUT_V1,
        order: getOrderedSidebarSectionIds(layout),
        sections: records.map((record) => ({
          id: record.id,
          label: record.meta?.label || record.id,
          visible: record.config?.visible !== false,
          order: record.config?.order ?? null,
          exists: record.node instanceof HTMLElement,
          native: record.meta?.native === true,
          cssOrder: record.node instanceof HTMLElement ? String(record.node.style.order || '') : '',
          orderManagedBy: record.node instanceof HTMLElement ? String(record.node.getAttribute('data-h2o-library-order-by-layout') || '') : '',
        })),
        protectedFooterCount: (() => {
          try { return D.querySelectorAll('[data-h2o-library-footer-order-guard="9000"]').length; } catch { return 0; }
        })(),
        protectedSpacerCount: (() => {
          try { return D.querySelectorAll('[data-h2o-library-spacer-order-guard="8990"]').length; } catch { return 0; }
        })(),
      };
    }

    function findInsertionTarget() {
      const labelsRoot = findLabelsRoot();
      if (labelsRoot?.parentElement) return { parent: labelsRoot.parentElement, beforeNode: labelsRoot, anchor: labelsRoot };

      const foldersRoot = findFoldersRoot();
      if (foldersRoot?.parentElement) return { parent: foldersRoot.parentElement, beforeNode: foldersRoot, anchor: foldersRoot };

      const projectsSection = findProjectsSection(findProjectsH2());
      if (projectsSection?.parentElement) return { parent: projectsSection.parentElement, beforeNode: projectsSection, anchor: projectsSection };

      return { parent: null, beforeNode: null, anchor: null };
    }

    function getNativeRowLabel(row) {
      try {
        const direct = row?.querySelector?.(SEL.sidebarTruncate);
        const text = normText(direct?.textContent || row?.textContent || row?.getAttribute?.('aria-label') || '');
        return text.replace(/[⇧⌘⌥⌃]\s*/g, '').trim();
      } catch {
        return '';
      }
    }

    function isNativeNewChatRow(row) {
      if (!(row instanceof HTMLElement)) return false;
      if (row.closest?.(`[${ATTR_CGXUI_OWNER}]`)) return false;
      const testId = String(row.getAttribute('data-testid') || '');
      if (testId === 'create-new-chat-button') return true;
      const href = row instanceof HTMLAnchorElement
        ? String(row.getAttribute('href') || '')
        : String(row.closest?.('a[href]')?.getAttribute?.('href') || '');
      const label = getNativeRowLabel(row);
      return href === '/' && /^New chat$/i.test(label);
    }

    function isExpandedTopNewChatButton(row) {
      if (!(row instanceof HTMLElement)) return false;
      if (row.closest?.('#stage-sidebar-tiny-bar')) return false;
      if (!isNativeNewChatRow(row)) return false;
      const li = row.closest?.('li');
      return !!(li instanceof HTMLElement && li.parentElement instanceof HTMLElement && li.parentElement.tagName === 'UL');
    }

    function findNativeNewChatButton() {
      const candidates = [];
      const addCandidate = (node) => {
        if (!(node instanceof HTMLElement)) return;
        if (candidates.includes(node)) return;
        candidates.push(node);
      };
      try {
        const exact = D.querySelector('[data-testid="create-new-chat-button"]');
        addCandidate(exact);
      } catch {}
      try {
        D.querySelectorAll('[data-testid="create-new-chat-button"]').forEach(addCandidate);
      } catch {}
      try {
        D.querySelectorAll('a[href="/"][data-sidebar-item="true"]').forEach(addCandidate);
      } catch {}
      const expanded = candidates.find(isExpandedTopNewChatButton);
      if (expanded instanceof HTMLElement) return expanded;
      const fallback = candidates.find((node) => node instanceof HTMLElement && !node.closest?.('#stage-sidebar-tiny-bar') && isNativeNewChatRow(node));
      if (fallback instanceof HTMLElement) return fallback;
      return null;
    }

    function isTrueTopLibraryButton(node) {
      return !!(node instanceof HTMLElement && node.matches?.(topLibraryButtonSelector()) && node.tagName === 'LI');
    }

    function isKnownNonWorkspaceRow(node) {
      if (!(node instanceof HTMLElement)) return false;
      const owner = String(node.getAttribute(ATTR_CGXUI_OWNER) || '');
      const cgxui = String(node.getAttribute(ATTR_CGXUI) || '');
      if (owner && owner !== SkID) return true;
      return cgxui === 'flsc-folder-row' ||
        cgxui === 'flsc-category-row' ||
        cgxui === 'lbsc-row' ||
        !!node.closest?.('[data-cgxui="flsc-root"],[data-cgxui="flsc-categories-root"],[data-cgxui="lbsc-root"]');
    }

    function countContaminatedTopButtonMarkers() {
      let count = 0;
      try {
        D.querySelectorAll(`[${ATTR_CGXUI_STATE}="top-library-button"]`).forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (isTrueTopLibraryButton(node)) return;
          count += 1;
        });
      } catch {}
      return count;
    }

    function cleanupContaminatedTopButtonMarkers(reason = 'cleanup') {
      let cleaned = 0;
      try {
        D.querySelectorAll(`[${ATTR_CGXUI_STATE}="top-library-button"],[data-h2o-library-workspace="top-button"],${utilSelScoped(UI_LIBRARY_TOP_BUTTON_LEGACY)}`).forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (isTrueTopLibraryButton(node)) return;
          if (node.matches?.(utilSelScoped(UI_LIBRARY_TOP_BUTTON_LEGACY))) {
            safeRemove(node);
            cleaned += 1;
            return;
          }
          if (node.matches?.(topLibraryButtonSelector())) {
            safeRemove(node);
            cleaned += 1;
            return;
          }
          const nonWorkspaceRow = isKnownNonWorkspaceRow(node);
          if (node.getAttribute(ATTR_CGXUI_STATE) === 'top-library-button') {
            node.removeAttribute(ATTR_CGXUI_STATE);
            cleaned += 1;
          }
          if (node.getAttribute('data-h2o-library-workspace') === 'top-button') {
            node.removeAttribute('data-h2o-library-workspace');
            cleaned += 1;
          }
          if (nonWorkspaceRow && node.getAttribute('aria-label') === 'Open Library') {
            node.removeAttribute('aria-label');
            cleaned += 1;
          }
          if (nonWorkspaceRow && node.getAttribute('title') === 'Library') {
            node.removeAttribute('title');
            cleaned += 1;
          }
        });
      } catch {}
      if (cleaned) {
        state.cleanedContaminatedTopButtonMarkersCount = Number(state.cleanedContaminatedTopButtonMarkersCount || 0) + cleaned;
        state.topLibraryButtonLastReason = `cleanup:${String(reason || 'cleanup')}`;
      }
      return cleaned;
    }

    function topButtonInsertionTarget() {
      const newChat = findNativeNewChatButton();
      if (!(newChat instanceof HTMLElement)) return { parent: null, beforeNode: null, afterBeforeNode: null, newChatLi: null, template: null, reason: 'new-chat-not-found' };
      const li = newChat.closest?.('li');
      if (!(li instanceof HTMLElement)) return { parent: null, beforeNode: null, afterBeforeNode: null, newChatLi: null, template: newChat, reason: 'new-chat-li-not-found' };
      const ul = li.parentElement;
      if (li instanceof HTMLElement && ul instanceof HTMLElement && ul.tagName === 'UL') {
        return { parent: ul, beforeNode: li, afterBeforeNode: li.nextElementSibling || null, newChatLi: li, template: newChat, reason: '' };
      }
      return { parent: null, beforeNode: null, afterBeforeNode: null, newChatLi: li, template: newChat, reason: 'new-chat-ul-not-found' };
    }

    function setLibraryRowContent(row, iconToken) {
      row.innerHTML = `
        <div class="flex min-w-0 items-center gap-1.5">
          <div class="flex items-center justify-center [opacity:var(--menu-item-icon-opacity,1)] icon">
            <span ${ATTR_CGXUI}="${iconToken}" ${ATTR_CGXUI_OWNER}="${SkID}">${FRAG_SVG_LIBRARY}</span>
          </div>
          <div ${ATTR_CGXUI_STATE}="label-wrap" class="flex min-w-0 grow items-center gap-2.5">
            <div ${ATTR_CGXUI_STATE}="label" class="truncate">Library</div>
          </div>
        </div>
      `;
    }

    function wireLibraryRow(row, source = 'sidebar') {
      const fire = (e) => {
        e.preventDefault();
        e.stopPropagation();
        owner.openWorkspace({ source }).catch((error) => err(`open-workspace:${source}`, error));
        scheduleLibraryActiveSync(`click:${source}`);
      };
      row.onclick = (e) => {
        if (e.defaultPrevented) return;
        if (e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        fire(e);
      };
      row.onkeydown = (e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        fire(e);
      };
      return row;
    }

    function buildTopLibraryButton(template) {
      ensureStyle();
      const tpl = template instanceof HTMLElement ? template : null;
      const li = D.createElement('li');
      li.className = 'list-none';
      li.setAttribute(ATTR_CGXUI, UI_LIBRARY_TOP_BUTTON);
      li.setAttribute(ATTR_CGXUI_OWNER, SkID);
      li.setAttribute(ATTR_CGXUI_STATE, 'top-library-button');
      li.setAttribute('data-h2o-library-workspace', 'top-button');

      const row = D.createElement('button');
      row.type = 'button';
      row.className = String(tpl?.className || 'group __menu-item hoverable w-full').trim();
      if (!/\bw-full\b/.test(row.className)) row.className = `${row.className} w-full`.trim();
      row.setAttribute('data-sidebar-item', 'true');
      row.setAttribute('data-fill', '');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-label', 'Open Library');
      row.setAttribute('title', 'Library');
      setLibraryRowContent(row, UI_LIBRARY_TOP_ICON_SLOT);
      wireLibraryRow(row, 'top-sidebar');
      li.appendChild(row);
      state.topLibraryButtonRenderCount = Number(state.topLibraryButtonRenderCount || 0) + 1;
      state.topLibraryButtonLastReason = 'build';
      return li;
    }

    function syncTopLibraryButtonRailState(reason = 'sync') {
      try {
        const root = D.querySelector(topLibraryButtonSelector());
        if (!(root instanceof HTMLElement)) return false;
        const row = root.querySelector?.('[data-sidebar-item="true"]');
        const box = root.parentElement || (row instanceof HTMLElement ? row.parentElement : null) || root;
        let width = 0;
        try { width = Number(box.getBoundingClientRect?.().width || 0) || 0; } catch {}
        if (!width && row instanceof HTMLElement) {
          try { width = Number(row.getBoundingClientRect?.().width || 0) || 0; } catch {}
        }
        const rail = width > 0 && width <= 96;
        root.setAttribute('data-h2o-library-rail-width', width ? String(Math.round(width)) : '');
        root.setAttribute('data-h2o-library-rail-reason', String(reason || 'sync').slice(0, 80));
        if (rail) {
          root.setAttribute(ATTR_CGXUI_MODE, 'rail');
          root.setAttribute('data-h2o-library-rail', '1');
          if (row instanceof HTMLElement) row.setAttribute('data-h2o-library-rail', '1');
        } else {
          if (root.getAttribute(ATTR_CGXUI_MODE) === 'rail') root.removeAttribute(ATTR_CGXUI_MODE);
          root.removeAttribute('data-h2o-library-rail');
          if (row instanceof HTMLElement) row.removeAttribute('data-h2o-library-rail');
        }
        state.topLibraryButtonRailMode = rail ? 'rail' : 'expanded';
        state.topLibraryButtonRailWidth = width ? Math.round(width) : 0;
        return rail;
      } catch {
        return false;
      }
    }

    function observeTopLibraryRailTarget(target) {
      if (!(target instanceof HTMLElement)) return;
      if (state.topLibraryButtonRailObservedTarget === target && state.topLibraryButtonRO) return;
      try { state.topLibraryButtonRO?.disconnect?.(); } catch {}
      state.topLibraryButtonRailObservedTarget = target;
      if (typeof W.ResizeObserver !== 'function') return;
      try {
        const ro = new W.ResizeObserver(() => syncTopLibraryButtonRailState('top-library-resize'));
        ro.observe(target);
        state.topLibraryButtonRO = ro;
        state.clean.observers.add(() => { try { ro.disconnect(); } catch {} });
      } catch {}
    }

    function isLibraryRouteActive() {
      return !!parseLibraryRoute(W.location.href);
    }

    function setActiveMarkers(el, active, currentValue = 'page') {
      if (!(el instanceof HTMLElement)) return false;
      try {
        if (active) {
          el.setAttribute('aria-current', currentValue);
          el.setAttribute('data-active', '');
          el.setAttribute('aria-selected', 'true');
        } else {
          el.removeAttribute('aria-current');
          el.removeAttribute('data-active');
          el.removeAttribute('aria-selected');
          try { el.classList?.remove?.('active', 'selected', 'current'); } catch {}
        }
        return true;
      } catch {
        return false;
      }
    }

    function hasActiveMarkers(el) {
      if (!(el instanceof HTMLElement)) return false;
      return el.hasAttribute('data-active') ||
        el.getAttribute('aria-current') === 'page' ||
        el.getAttribute('aria-selected') === 'true' ||
        String(el.className || '').split(/\s+/).some((token) => token === 'active' || token === 'selected' || token === 'current');
    }

    function nativeSidebarActiveRows() {
      try {
        return [...D.querySelectorAll('[data-sidebar-item="true"]')]
          .filter((el) => el instanceof HTMLElement)
          .filter((el) => !el.closest?.(`[${ATTR_CGXUI_OWNER}]`))
          .filter((el) => !el.closest?.('[role="dialog"],[data-radix-popper-content-wrapper]'))
          .filter(hasActiveMarkers);
      } catch {
        return [];
      }
    }

    function clearNativeSidebarActiveRows(reason = 'library-active') {
      let cleared = 0;
      nativeSidebarActiveRows().forEach((row) => {
        try {
          row.removeAttribute('data-active');
          row.removeAttribute('aria-current');
          row.removeAttribute('aria-selected');
          row.classList?.remove?.('active', 'selected', 'current');
          cleared += 1;
        } catch {}
      });
      state.nativeActiveRowsClearedLastCount = cleared;
      return cleared;
    }

    function syncTopLibraryButtonActiveState(reason = 'sync', activeRaw = null) {
      try {
        const root = D.querySelector(topLibraryButtonSelector());
        if (!root) return;
        const row = root.querySelector?.('[data-sidebar-item="true"]') || root;
        state.topLibraryButtonActiveSyncCount = Number(state.topLibraryButtonActiveSyncCount || 0) + 1;
        state.topLibraryButtonLastReason = String(reason || 'sync');
        const active = activeRaw == null ? isLibraryRouteActive() : !!activeRaw;
        if (row instanceof HTMLAnchorElement) row.setAttribute('href', getLibraryRouteHref());
        setActiveMarkers(root, active);
        setActiveMarkers(row, active);
        syncTopLibraryButtonRailState(reason);
      } catch {}
    }

    function ensureTopLibraryButton(reason = 'ensure') {
      state.topLibraryButtonInsertAttempted = true;
      state.lastTopButtonEnsureReason = String(reason || 'ensure');
      cleanupContaminatedTopButtonMarkers(reason);
      const target = topButtonInsertionTarget();
      if (!target.parent || !target.newChatLi) {
        state.topLibraryButtonInsertFailedReason = String(target.reason || 'top-anchor-not-found');
        state.topLibraryButtonLastReason = `failed:${String(reason || 'ensure')}`;
        return false;
      }
      const scoped = topLibraryButtonSelector();
      const rows = [...D.querySelectorAll(scoped)];
      D.querySelectorAll(utilSelScoped(UI_LIBRARY_TOP_BUTTON_LEGACY)).forEach((node) => safeRemove(node));
      const existing = rows.find((node) => node instanceof HTMLElement && node.tagName === 'LI') || null;
      rows.forEach((node) => { if (node !== existing) safeRemove(node); });
      const row = existing || buildTopLibraryButton(target.template);
      observeTopLibraryRailTarget(target.parent);
      let placed = false;
      try {
        if (row.parentElement !== target.parent || row.nextElementSibling !== target.newChatLi) {
          target.parent.insertBefore(row, target.beforeNode);
        }
        placed = row.parentElement === target.parent && row.nextElementSibling === target.newChatLi;
      } catch {}
      if (!placed) {
        try {
          const afterBeforeNode = target.afterBeforeNode || null;
          target.parent.insertBefore(row, afterBeforeNode);
          placed = row.parentElement === target.parent && row.previousElementSibling === target.newChatLi;
        } catch {}
      }
      if (!placed) {
        state.topLibraryButtonInsertFailedReason = 'top-button-placement-not-adjacent-to-new-chat';
        state.topLibraryButtonLastReason = `failed:${String(reason || 'ensure')}`;
        return false;
      }
      state.topLibraryButtonInsertFailedReason = '';
      recordFirstShellTime('firstTopLibraryButtonAt');
      syncTopLibraryButtonActiveState(reason);
      return true;
    }

    function findCollapsedRailRoot() {
      try {
        const rail = D.getElementById('stage-sidebar-tiny-bar') || D.querySelector('#stage-sidebar-tiny-bar');
        return rail instanceof HTMLElement ? rail : null;
      } catch {
        return null;
      }
    }

    function findCollapsedRailStack(rail = findCollapsedRailRoot()) {
      if (!(rail instanceof HTMLElement)) return null;
      try {
        const primary = rail.querySelector('div.mt-\\(\\--sidebar-section-first-margin-top\\)');
        if (primary instanceof HTMLElement) return primary;
      } catch {}
      try {
        const fallback = rail.querySelector(':scope > div:nth-child(2)');
        if (fallback instanceof HTMLElement) return fallback;
      } catch {}
      return null;
    }

    function closestDirectChild(parent, node) {
      if (!(parent instanceof HTMLElement) || !(node instanceof HTMLElement)) return null;
      let cur = node;
      while (cur && cur.parentElement && cur.parentElement !== parent) cur = cur.parentElement;
      return cur instanceof HTMLElement && cur.parentElement === parent ? cur : null;
    }

    function railButtonWrapFor(button, stack = findCollapsedRailStack()) {
      if (!(button instanceof HTMLElement)) return null;
      if (stack instanceof HTMLElement) {
        const child = closestDirectChild(stack, button);
        if (child instanceof HTMLElement) return child;
      }
      return button.closest?.(`[${ATTR_CGXUI_OWNER}="${SkID}"][data-h2o-library-workspace="rail-button-wrap"]`) || button.parentElement || button;
    }

    function removeRailLibraryButtonNode(node) {
      if (!(node instanceof HTMLElement)) return;
      const wrap = railButtonWrapFor(node);
      safeRemove(wrap || node);
    }

    function railButtonInsertionTarget() {
      const rail = findCollapsedRailRoot();
      const stack = findCollapsedRailStack(rail);
      if (!(rail instanceof HTMLElement)) return { rail: null, parent: null, beforeNode: null, template: null, templateWrap: null, reason: 'rail-not-found' };
      if (!(stack instanceof HTMLElement)) return { rail, parent: null, beforeNode: null, template: null, templateWrap: null, reason: 'rail-stack-not-found' };
      const newChat = [...stack.querySelectorAll('[data-testid="create-new-chat-button"]')]
        .find((node) => node instanceof HTMLElement && !node.closest?.(`[${ATTR_CGXUI_OWNER}="${SkID}"]`));
      if (!(newChat instanceof HTMLElement)) return { rail, parent: stack, beforeNode: null, template: null, templateWrap: null, reason: 'rail-new-chat-not-found' };
      const wrap = closestDirectChild(stack, newChat) || newChat.closest?.('div[data-state]') || newChat.parentElement || null;
      if (!(wrap instanceof HTMLElement)) return { rail, parent: stack, beforeNode: null, template: newChat, templateWrap: null, reason: 'rail-new-chat-wrap-not-found' };
      return { rail, parent: stack, beforeNode: wrap, template: newChat, templateWrap: wrap, reason: '' };
    }

    function setLibraryRailButtonContent(row) {
      row.innerHTML = `
        <div class="flex items-center justify-center [opacity:var(--menu-item-icon-opacity,1)] icon">
          <span ${ATTR_CGXUI}="${UI_LIBRARY_RAIL_ICON_SLOT}" ${ATTR_CGXUI_OWNER}="${SkID}">${FRAG_SVG_LIBRARY}</span>
        </div>
        <span class="sr-only">Library</span>
      `;
    }

    function buildRailLibraryButton(target = {}) {
      ensureStyle();
      const templateWrap = target.templateWrap instanceof HTMLElement ? target.templateWrap : null;
      const template = target.template instanceof HTMLElement ? target.template : null;
      const wrap = D.createElement('div');
      wrap.className = String(templateWrap?.className || '');
      wrap.setAttribute('data-state', templateWrap?.getAttribute?.('data-state') || 'closed');
      wrap.setAttribute(ATTR_CGXUI_OWNER, SkID);
      wrap.setAttribute('data-h2o-library-workspace', 'rail-button-wrap');

      const row = D.createElement('button');
      row.type = 'button';
      row.className = String(template?.className || 'group __menu-item hoverable gap-1.5 w-full').trim();
      if (!/\bw-full\b/.test(row.className)) row.className = `${row.className} w-full`.trim();
      row.setAttribute(ATTR_CGXUI, UI_LIBRARY_RAIL_BUTTON);
      row.setAttribute(ATTR_CGXUI_OWNER, SkID);
      row.setAttribute(ATTR_CGXUI_STATE, 'rail-library-button');
      row.setAttribute('data-sidebar-item', 'true');
      row.setAttribute('data-fill', '');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-label', 'Open Library');
      row.setAttribute('title', 'Library');
      setLibraryRailButtonContent(row);
      row.onpointerdown = (e) => { try { e.preventDefault(); } catch {} try { e.stopPropagation(); } catch {} };
      row.onmousedown = (e) => { try { e.preventDefault(); } catch {} try { e.stopPropagation(); } catch {} };
      wireLibraryRow(row, 'rail-sidebar');
      wrap.appendChild(row);
      state.railLibraryButtonRenderCount = Number(state.railLibraryButtonRenderCount || 0) + 1;
      state.railLibraryButtonLastReason = 'build';
      return { wrap, row };
    }

    function syncRailLibraryButtonActiveState(reason = 'sync', activeRaw = null) {
      try {
        const rows = [...D.querySelectorAll(railLibraryButtonSelector())];
        if (!rows.length) return;
        state.railLibraryButtonActiveSyncCount = Number(state.railLibraryButtonActiveSyncCount || 0) + 1;
        state.railLibraryButtonLastReason = String(reason || 'sync');
        const active = activeRaw == null ? isLibraryRouteActive() : !!activeRaw;
        rows.forEach((row) => {
          if (!(row instanceof HTMLElement)) return;
          const wrap = railButtonWrapFor(row);
          setActiveMarkers(row, active);
          if (wrap instanceof HTMLElement) setActiveMarkers(wrap, active);
        });
      } catch {}
    }

    function ensureRailLibraryButton(reason = 'ensure') {
      state.railLibraryButtonInsertAttempted = true;
      state.lastRailButtonEnsureReason = String(reason || 'ensure');
      const target = railButtonInsertionTarget();
      if (!target.parent || !target.beforeNode) {
        state.railLibraryButtonInsertFailedReason = String(target.reason || 'rail-anchor-not-found');
        state.railLibraryButtonLastReason = `failed:${String(reason || 'ensure')}`;
        return false;
      }

      const rows = [...D.querySelectorAll(railLibraryButtonSelector())];
      const existing = rows.find((node) => node instanceof HTMLElement && node.closest?.('#stage-sidebar-tiny-bar')) || null;
      rows.forEach((node) => { if (node !== existing) removeRailLibraryButtonNode(node); });

      let row = existing;
      let wrap = row ? railButtonWrapFor(row, target.parent) : null;
      if (!(row instanceof HTMLElement) || !(wrap instanceof HTMLElement)) {
        const built = buildRailLibraryButton(target);
        wrap = built.wrap;
        row = built.row;
      }

      let placed = false;
      try {
        if (wrap.parentElement !== target.parent || wrap.nextElementSibling !== target.beforeNode) {
          target.parent.insertBefore(wrap, target.beforeNode);
        }
        placed = wrap.parentElement === target.parent && wrap.nextElementSibling === target.beforeNode;
      } catch {}
      if (!placed) {
        state.railLibraryButtonInsertFailedReason = 'rail-button-placement-not-before-new-chat';
        state.railLibraryButtonLastReason = `failed:${String(reason || 'ensure')}`;
        return false;
      }
      state.railLibraryButtonInsertFailedReason = '';
      syncRailLibraryButtonActiveState(reason);
      return true;
    }

    function removeLowerLibrarySidebarRoot(reason = 'top-library-button') {
      let removed = 0;
      D.querySelectorAll(utilSelScoped(UI_LIBRARY_ROOT)).forEach((node) => {
        safeRemove(node);
        removed += 1;
      });
      if (removed) state.lastSidebarRenderReason = `remove-lower:${String(reason || 'top-library-button')}`;
      return removed;
    }

    function getTopLibraryButtonPlacementInfo() {
      const top = D.querySelector(topLibraryButtonSelector());
      const newChat = findNativeNewChatButton();
      const parent = top?.parentElement || null;
      const newChatLi = newChat?.closest?.('li') || newChat;
      const sameParent = !!(top && newChatLi && parent === newChatLi.parentElement);
      const following = Number(W.Node?.DOCUMENT_POSITION_FOLLOWING || 4);
      const immediatelyBefore = !!(sameParent && top.nextElementSibling === newChatLi);
      const immediatelyAfter = !!(sameParent && top.previousElementSibling === newChatLi);
      return {
        hasTopButton: !!top,
        hasNativeNewChat: !!newChat,
        sameParentAsNewChat: sameParent,
        beforeNewChat: !!(sameParent && (top.compareDocumentPosition(newChatLi) & following)),
        afterNewChat: !!(sameParent && (newChatLi.compareDocumentPosition(top) & following)),
        immediatelyBeforeNewChat: immediatelyBefore,
        immediatelyAfterNewChat: immediatelyAfter,
        adjacentToNewChat: immediatelyBefore || immediatelyAfter,
        parentTag: parent?.tagName || '',
        parentClass: String(parent?.className || ''),
        parentChildCount: Number(parent?.children?.length || 0) || 0,
        parentText: normText(parent?.textContent || '').slice(0, 160),
        newChatTag: newChat?.tagName || '',
        newChatText: getNativeRowLabel(newChat).slice(0, 80),
      };
    }

    function getRailLibraryButtonPlacementInfo() {
      const rail = findCollapsedRailRoot();
      const stack = findCollapsedRailStack(rail);
      const row = D.querySelector(railLibraryButtonSelector());
      const wrap = row instanceof HTMLElement ? railButtonWrapFor(row, stack) : null;
      const newChat = stack instanceof HTMLElement
        ? [...stack.querySelectorAll('[data-testid="create-new-chat-button"]')].find((node) => node instanceof HTMLElement && !node.closest?.(`[${ATTR_CGXUI_OWNER}="${SkID}"]`))
        : null;
      const newChatWrap = stack instanceof HTMLElement && newChat instanceof HTMLElement
        ? closestDirectChild(stack, newChat)
        : null;
      const sameParent = !!(wrap instanceof HTMLElement && newChatWrap instanceof HTMLElement && wrap.parentElement === newChatWrap.parentElement);
      const following = Number(W.Node?.DOCUMENT_POSITION_FOLLOWING || 4);
      return {
        hasRail: rail instanceof HTMLElement,
        hasRailStack: stack instanceof HTMLElement,
        hasRailButton: row instanceof HTMLElement,
        hasNativeRailNewChat: newChat instanceof HTMLElement,
        sameParentAsNewChat: sameParent,
        beforeNewChat: !!(sameParent && (wrap.compareDocumentPosition(newChatWrap) & following)),
        immediatelyBeforeNewChat: !!(sameParent && wrap.nextElementSibling === newChatWrap),
        railTag: rail?.tagName || '',
        railClass: String(rail?.className || ''),
        parentTag: stack?.tagName || '',
        parentClass: String(stack?.className || ''),
        parentChildCount: Number(stack?.children?.length || 0) || 0,
        parentText: normText(stack?.textContent || '').slice(0, 160),
        buttonTag: row?.tagName || '',
        buttonText: normText(row?.textContent || '').slice(0, 80),
        wrapperTag: wrap?.tagName || '',
        wrapperClass: String(wrap?.className || ''),
      };
    }

    function recordFirstShellTime(field) {
      if (!state[field]) state[field] = Date.now();
      if (!state.firstSidebarShellAt) state.firstSidebarShellAt = state[field];
    }

    function setShellHeaderLabel(headerBtn, labelText) {
      try {
        const label = headerBtn.querySelector?.('h2.__menu-label') ||
          headerBtn.querySelector?.('[data-no-spacing="true"]') ||
          headerBtn.querySelector?.('h2');
        if (label instanceof HTMLElement) {
          label.textContent = labelText;
          return;
        }
        const h2 = D.createElement('h2');
        h2.className = '__menu-label';
        h2.setAttribute('data-no-spacing', 'true');
        h2.textContent = labelText;
        headerBtn.appendChild(h2);
      } catch {}
    }

    function makePrepaintHeader(spec, templateSection = null) {
      const template = templateSection?.querySelector?.(':scope > button') || templateSection?.querySelector?.('button') || null;
      let headerBtn = null;
      if (template instanceof HTMLElement) {
        headerBtn = template.cloneNode(true);
        headerBtn.querySelectorAll?.('[id]').forEach((el) => el.removeAttribute('id'));
        headerBtn.removeAttribute('aria-controls');
      } else {
        headerBtn = D.createElement('button');
        headerBtn.type = 'button';
        headerBtn.className = 'text-token-text-tertiary flex w-full items-center justify-start gap-0.5 px-4 py-1.5';
        headerBtn.innerHTML = '<h2 class="__menu-label" data-no-spacing="true"></h2>';
      }
      headerBtn.type = 'button';
      headerBtn.setAttribute('aria-expanded', 'true');
      headerBtn.setAttribute('data-h2o-sidebar-shell-inert', '1');
      headerBtn.onclick = null;
      setShellHeaderLabel(headerBtn, spec.label);
      return headerBtn;
    }

    function getPrepaintHeaderTemplate(target = {}) {
      const anchor = target.anchor instanceof HTMLElement ? target.anchor : null;
      if (anchor && !anchor.closest?.('[data-cgxui-owner],[data-cgxui]')) return anchor;
      return findProjectsSection(findProjectsH2()) || findRecentsSection() || null;
    }

    function makePrepaintSectionShell(spec, target = {}) {
      const templateSection = getPrepaintHeaderTemplate(target);
      const section = D.createElement('div');
      section.className = String(templateSection?.className || 'group/sidebar-expando-section mb-[var(--sidebar-collapsed-section-margin-bottom)]');
      section.setAttribute(ATTR_CGXUI, spec.token);
      section.setAttribute(ATTR_CGXUI_OWNER, spec.owner);
      section.setAttribute(ATTR_CGXUI_MODE, 'prepaint');
      section.setAttribute('data-h2o-sidebar-shell', 'prepaint');
      section.setAttribute('data-h2o-sidebar-shell-owner', 'library-workspace');
      section.setAttribute('data-h2o-sidebar-shell-section', spec.id);
      section.appendChild(makePrepaintHeader(spec, templateSection));
      const list = D.createElement('div');
      list.setAttribute(ATTR_CGXUI_STATE, 'prepaint-list');
      list.setAttribute('data-h2o-sidebar-shell-list', '1');
      section.appendChild(list);
      state.sidebarShellRenderCount = Number(state.sidebarShellRenderCount || 0) + 1;
      state.sidebarShellMode = state.sidebarShellMode || 'prepaint';
      return section;
    }

    function prepaintOrderedSpecs() {
      return getOrderedSidebarSectionIds(getSidebarLayout())
        .map((id) => SIDEBAR_PREPAINT_SECTIONS[id])
        .filter(Boolean);
    }

    function markPrepaintShellSeen(spec, root, reason = 'prepaint') {
      if (!(root instanceof HTMLElement)) return;
      if (spec.id === 'folders') recordFirstShellTime('firstFoldersShellAt');
      if (spec.id === 'labels') recordFirstShellTime('firstLabelsShellAt');
      if (spec.id === 'categories') recordFirstShellTime('firstCategoriesShellAt');
      root.setAttribute('data-h2o-sidebar-shell-section', spec.id);
      root.setAttribute('data-h2o-sidebar-shell-last-reason', String(reason || 'prepaint').slice(0, 80));
    }

    function prepaintHydrationReady() {
      return ['folders', 'labels', 'categories'].every((id) => {
        const root = findPrepaintOwnedRoot(id);
        return root instanceof HTMLElement && root.getAttribute('data-h2o-sidebar-shell') !== 'prepaint';
      });
    }

    function hydratePrepaintOwners(reason = 'prepaint') {
      let hydrated = 0;
      const call = (fn, why) => {
        if (typeof fn !== 'function') return;
        try {
          const result = fn(`workspace-${why}:${String(reason || 'prepaint')}`);
          if (result !== false) hydrated += 1;
        } catch (error) {
          err(`prepaint-hydrate:${why}`, error);
        }
      };
      call(H2O.folders?.ensureInjected || H2O.folders?.core?.ensureInjected, 'folders');
      call(H2O.Labels?.ensureInjected, 'labels');
      if (hydrated) {
        state.sidebarHydrationCount = Number(state.sidebarHydrationCount || 0) + hydrated;
        state.sidebarHydrationLastReason = String(reason || 'prepaint');
        if (state.sidebarShellMode !== 'fallback') state.sidebarShellMode = 'hydrated';
      }
      return hydrated;
    }

    function ensureSidebarPrepaint(reason = 'prepaint') {
      state.sidebarHydrationLastReason = String(reason || 'prepaint');
      const target = getPrepaintInsertionTarget();
      if (!(target.parent instanceof HTMLElement)) {
        state.sidebarShellMode = state.sidebarShellMode || 'fallback';
        return false;
      }

      let ok = false;
      state.suppressMO = true;
      try {
        const railOk = ensureRailLibraryButton(`prepaint:${reason}`);
        const topOk = ensureTopLibraryButton(`prepaint:${reason}`);
        if (topOk) {
          recordFirstShellTime('firstTopLibraryButtonAt');
          state.sidebarShellMode = state.sidebarShellMode || 'prepaint';
        }
        if (railOk) state.sidebarShellMode = state.sidebarShellMode || 'prepaint';

        const rootScope = target.nav instanceof HTMLElement ? target.nav : D;
        const ordered = prepaintOrderedSpecs();
        const roots = [];
        ordered.forEach((spec) => {
          const existing = findPrepaintOwnedRoot(spec.id) || null;
          let root = existing;
          if (!root) root = makePrepaintSectionShell(spec, target);
          markPrepaintShellSeen(spec, root, reason);
          const removed = getNativeSidebarService()?.removeDuplicateOwnedRoots?.(spec.token, spec.owner, rootScope, root) || 0;
          if (removed) state.sidebarShellSkippedDuplicateCount = Number(state.sidebarShellSkippedDuplicateCount || 0) + removed;
          roots.push(root);
        });

        let before = target.beforeNode instanceof Node && !roots.includes(target.beforeNode) ? target.beforeNode : null;
        for (let idx = roots.length - 1; idx >= 0; idx -= 1) {
          const root = roots[idx];
          if (!(root instanceof HTMLElement)) continue;
          if (root.parentElement !== target.parent || root.nextElementSibling !== before) {
            target.parent.insertBefore(root, before);
          }
          before = root;
        }

        if (roots.length) {
          state.sidebarShellMode = state.sidebarShellMode || 'prepaint';
          ok = true;
        }
      } catch (error) {
        err('ensure-sidebar-prepaint', error);
        ok = false;
      } finally {
        state.suppressMO = false;
      }

      if (ok) {
        applySidebarLayout(`prepaint:${String(reason || 'prepaint')}`);
        hydratePrepaintOwners(reason);
        state.sidebarPrepaintStable = !!(
          D.querySelector(topLibraryButtonSelector()) &&
          findPrepaintOwnedRoot('folders') &&
          findPrepaintOwnedRoot('labels') &&
          findPrepaintOwnedRoot('categories')
        );
        step('sidebar-prepaint-ok', reason);
      }
      return ok;
    }

    function scheduleSidebarPrepaint(reason = 'prepaint') {
      const delays = [0, 16, 80, 180, 360, 900, 1500];
      delays.forEach((delay, idx) => {
        const timer = W.setTimeout(() => {
          state.clean.timers.delete(timer);
          if (state.sidebarPrepaintStable && idx > 1 && prepaintHydrationReady()) return;
          ensureSidebarPrepaint(`${reason}-${idx + 1}`);
        }, delay);
        state.sidebarPrepaintTimers.push(timer);
        state.clean.timers.add(timer);
      });
      try {
        if (typeof W.requestAnimationFrame === 'function') {
          W.requestAnimationFrame(() => ensureSidebarPrepaint(`${reason}-raf`));
        }
      } catch {}
    }

    function ensureSidebarPrepaintObserver(reason = 'boot') {
      const target = getPrepaintInsertionTarget();
      const root = target.nav?.closest?.('#stage-slideover-sidebar') || target.nav || D.body;
      if (!(root instanceof HTMLElement)) return;
      if (state.sidebarPrepaintObservedRoot === root && state.sidebarPrepaintObserver) return;
      try { state.sidebarPrepaintObserver?.disconnect?.(); } catch {}
      state.sidebarPrepaintObservedRoot = root;
      const mo = new MutationObserver((muts) => {
        if (state.suppressMO) return;
        if (mutationHasOnlyH2OOwnedNodes(muts)) {
          state.sidebarSkippedH2OMutations = Number(state.sidebarSkippedH2OMutations || 0) + 1;
          scheduleSidebarActiveSync('prepaint-h2o-owned-mutation');
          return;
        }
        if (state.sidebarPrepaintStable && prepaintHydrationReady()) {
          try { mo.disconnect(); } catch {}
          return;
        }
        ensureSidebarPrepaint(`prepaint-mutation:${reason}`);
      });
      mo.observe(root, { childList: true, subtree: true });
      state.sidebarPrepaintObserver = mo;
      state.clean.observers.add(() => { try { mo.disconnect(); } catch {} });
    }

    function makeSidebarLibraryRoot(anchor) {
      ensureStyle();
      const root = D.createElement('div');
      root.setAttribute(ATTR_CGXUI, UI_LIBRARY_ROOT);
      root.setAttribute(ATTR_CGXUI_OWNER, SkID);
      root.setAttribute('data-h2o-library-workspace', 'root');

      const tplDiv = D.querySelector(`nav ${SEL.sidebarItemDiv}`) || D.querySelector(SEL.sidebarItemDiv) || null;
      const tplA = D.querySelector(`nav ${SEL.sidebarItemAnchor}`) || D.querySelector(SEL.sidebarItemAnchor) || null;
      const tpl = tplDiv || tplA || null;
      const row = D.createElement('a');
      row.className = tpl?.className || 'group __menu-item hoverable';
      row.setAttribute(ATTR_CGXUI, UI_LIBRARY_ROW);
      row.setAttribute(ATTR_CGXUI_OWNER, SkID);
      row.setAttribute('data-sidebar-item', 'true');
      row.setAttribute('data-fill', '');
      row.setAttribute('data-discover', 'true');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-label', 'Open Library');
      row.setAttribute('href', getLibraryRouteHref());
      row.title = 'Library';
      setLibraryRowContent(row, UI_LIBRARY_ICON_SLOT);
      wireLibraryRow(row, 'sidebar');

      root.appendChild(row);
      state.sidebarRenderCount = Number(state.sidebarRenderCount || 0) + 1;
      state.lastSidebarRenderReason = 'make-root';
      state.sidebarLastRenderReason = 'make-root';
      state.sidebarLastRenderAt = Date.now();
      syncSidebarActiveState(root, 'make-root');
      return root;
    }

    function syncLowerLibraryRowActiveState(active, root = D.querySelector(utilSelScoped(UI_LIBRARY_ROOT)), reason = 'sync') {
      try {
        const row = root?.querySelector?.(utilSelScoped(UI_LIBRARY_ROW));
        if (row) {
          state.sidebarActiveSyncCount = Number(state.sidebarActiveSyncCount || 0) + 1;
          state.lastSidebarActiveSyncReason = String(reason || 'sync');
          state.sidebarLastActiveSyncReason = String(reason || 'sync');
          state.sidebarLastActiveSyncAt = Date.now();
          row.setAttribute('href', getLibraryRouteHref());
          setActiveMarkers(root, active);
          setActiveMarkers(row, active);
        }
      } catch {}
    }

    function syncLibrarySidebarActiveState(reason = 'api') {
      const active = isLibraryRouteActive();
      state.libraryActiveSyncCount = Number(state.libraryActiveSyncCount || 0) + 1;
      state.lastLibraryActiveSyncReason = String(reason || 'api');
      state.lastLibraryActiveSyncAt = Date.now();
      syncLowerLibraryRowActiveState(active, D.querySelector(utilSelScoped(UI_LIBRARY_ROOT)), reason);
      syncTopLibraryButtonActiveState(reason, active);
      syncRailLibraryButtonActiveState(reason, active);
      if (active) clearNativeSidebarActiveRows(reason);
      else state.nativeActiveRowsClearedLastCount = 0;
      return active;
    }

    function syncSidebarActiveState(root = D.querySelector(utilSelScoped(UI_LIBRARY_ROOT)), reason = 'sync') {
      return syncLibrarySidebarActiveState(reason);
    }

    function scheduleSidebarActiveSync(reason = 'sync') {
      scheduleLibraryActiveSync(reason);
    }

    function scheduleLibraryActiveSync(reason = 'sync', delay = 0) {
      const key = delay > 0 ? 'libraryActiveSyncDelayTimer' : 'libraryActiveSyncTimer';
      if (state[key]) {
        try { W.clearTimeout(state[key]); } catch {}
        try { state.clean.timers.delete(state[key]); } catch {}
      }
      state[key] = W.setTimeout(() => {
        const timer = state[key];
        state[key] = 0;
        state.clean.timers.delete(timer);
        syncLibrarySidebarActiveState(reason);
      }, Math.max(0, Number(delay || 0)));
      state.clean.timers.add(state[key]);
    }

    function scheduleLibraryActiveSyncPair(reason = 'sync') {
      scheduleLibraryActiveSync(reason, 0);
      scheduleLibraryActiveSync(`${reason}:after-native`, 90);
    }

    function ensureSidebarObserver(root) {
      if (!(root instanceof HTMLElement)) return;
      if (state.observedRoot === root && state.sidebarMO) return;
      try { state.sidebarMO?.disconnect?.(); } catch {}
      state.observedRoot = root;
      const mo = new MutationObserver((muts) => {
        if (state.suppressMO) return;
        if (mutationHasOnlyH2OOwnedNodes(muts)) {
          if (D.querySelector(utilSelScoped(UI_LIBRARY_ROOT)) || D.querySelector(utilSelScoped(UI_LIBRARY_TOP_BUTTON)) || D.querySelector(utilSelScoped(UI_LIBRARY_RAIL_BUTTON))) {
            state.sidebarSkippedH2OMutations = Number(state.sidebarSkippedH2OMutations || 0) + 1;
            state.topLibraryButtonSkippedH2OMutations = Number(state.topLibraryButtonSkippedH2OMutations || 0) + 1;
            scheduleSidebarActiveSync('h2o-owned-mutation');
            return;
          }
        }
        const relevant = muts.some((mu) => {
          const target = mu.target;
          if (!(target instanceof HTMLElement)) return true;
          return !target.closest?.(utilSelScoped(UI_LIBRARY_ROOT)) && !target.closest?.(utilSelScoped(UI_LIBRARY_TOP_BUTTON)) && !target.closest?.(utilSelScoped(UI_LIBRARY_RAIL_BUTTON));
        });
        if (!relevant) return;
        scheduleEnsure('sidebar-mutation');
      });
      mo.observe(root, { childList: true, subtree: true });
      state.sidebarMO = mo;
      state.clean.observers.add(() => { try { mo.disconnect(); } catch {} });
    }

    function scheduleEnsure(reason = 'schedule') {
      if (state.ensureTimer) W.clearTimeout(state.ensureTimer);
      state.ensureTimer = W.setTimeout(() => {
        state.clean.timers.delete(state.ensureTimer);
        state.ensureTimer = 0;
        ensureInjected(reason);
      }, 180);
      state.clean.timers.add(state.ensureTimer);
    }

    function ensureInjected(reason = 'ensure') {
      if (state.building) return false;
      state.sidebarEnsureCount = Number(state.sidebarEnsureCount || 0) + 1;
      state.lastSidebarEnsureReason = String(reason || 'ensure');
      state.sidebarLastEnsureReason = String(reason || 'ensure');
      state.sidebarLastEnsureAt = Date.now();
      state.building = true;
      state.suppressMO = true;
      try {
        const railOk = ensureRailLibraryButton(reason);
        const railTarget = railButtonInsertionTarget();
        if (railTarget.rail) ensureSidebarObserver(pickSidebarObserverRoot(railTarget.rail));
        const topOk = ensureTopLibraryButton(reason);
        const topTarget = topButtonInsertionTarget();
        if (topTarget.beforeNode) ensureSidebarObserver(pickSidebarObserverRoot(topTarget.beforeNode));
        if (topOk) {
          removeLowerLibrarySidebarRoot(reason);
          applySidebarLayout('ensure-top:' + String(reason || 'ensure'));
          step('top-sidebar-ok', String(reason || 'ensure') + (railOk ? ':rail-ok' : ':rail-missing'));
          return true;
        }

        const target = findInsertionTarget();
        if (!target.parent || !target.beforeNode) {
          return false;
        }
        ensureSidebarObserver(pickSidebarObserverRoot(target.anchor || target.beforeNode));

        const scoped = utilSelScoped(UI_LIBRARY_ROOT);
        const roots = [...D.querySelectorAll(scoped)];
        const existing = roots[0] || null;

        roots.slice(1).forEach((node) => safeRemove(node));
        const root = existing || makeSidebarLibraryRoot(target.anchor);
        if (root.parentElement !== target.parent || root.nextElementSibling !== target.beforeNode) {
          target.parent.insertBefore(root, target.beforeNode);
        }
        syncSidebarActiveState(root, reason);
        applySidebarLayout('ensure:' + String(reason || 'ensure'));
        step('sidebar-ok', reason);
        return true;
      } catch (error) {
        err('ensure-injected', error);
        return false;
      } finally {
        state.suppressMO = false;
        state.building = false;
      }
    }

    function scheduleTopLibraryButtonRetries(reason = 'boot') {
      const delays = [0, 120, 360, 900, 1800];
      delays.forEach((delay, idx) => {
        const timer = W.setTimeout(() => {
          state.clean.timers.delete(timer);
          ensureRailLibraryButton(`${reason}-rail-retry-${idx + 1}`);
          if (D.querySelector(topLibraryButtonSelector())) {
            const placement = getTopLibraryButtonPlacementInfo();
            if (placement.immediatelyBeforeNewChat) {
              syncLibrarySidebarActiveState(`${reason}-retry-present`);
              return;
            }
          }
          ensureInjected(`${reason}-top-retry-${idx + 1}`);
        }, delay);
        state.clean.timers.add(timer);
      });
    }

    function ensureStyle() {
      if (D.getElementById(CSS_STYLE_ID)) return;
      const style = D.createElement('style');
      style.id = CSS_STYLE_ID;
      style.textContent = CSS_TEXT();
      D.head.appendChild(style);
      state.clean.nodes.add(style);
    }

    function CSS_TEXT() {
      const ROOT = utilSelScoped(UI_LIBRARY_ROOT);
      const ROW = utilSelScoped(UI_LIBRARY_ROW);
      const TOP = topLibraryButtonSelector();
      const TOP_ROW = `${TOP} > [data-sidebar-item="true"]`;
      const RAIL = railLibraryButtonSelector();
      const PAGE_HOST = utilSelScoped(UI_LIBRARY_PAGE_HOST);
      const PAGE = utilSelScoped(UI_LIBRARY_PAGE);
      const ICON = utilSelScoped(UI_LIBRARY_ICON_SLOT);
      const TOP_ICON = utilSelScoped(UI_LIBRARY_TOP_ICON_SLOT);
      const RAIL_ICON = utilSelScoped(UI_LIBRARY_RAIL_ICON_SLOT);
      return `
/* ===========================
   🗂️ Library Workspace — cgxui (${SkID})
   =========================== */
${ROOT}{
  margin:0;
  padding:0 0 calc(var(--sidebar-section-margin-top, 10px) - var(--sidebar-section-first-margin-top, 0px));
}
${ROOT}[data-h2o-library-hidden-by-layout="1"]{ padding-bottom:0; }
${ROW},${TOP_ROW}{
  box-sizing: border-box;
  display: flex !important;
  width:100%;
  color:inherit;
  text-decoration:none;
  user-select: none;
}
${ROW}:hover,${TOP_ROW}:hover{ background: var(--interactive-bg-secondary-hover, rgba(255,255,255,.08)); }
${ROW}[aria-current="page"],
${ROW}[data-active],
${TOP}[aria-current="page"] > [data-sidebar-item="true"],
${TOP}[data-active] > [data-sidebar-item="true"],
${RAIL}[aria-current="page"],
${RAIL}[data-active]{ background: var(--interactive-bg-secondary-press, rgba(255,255,255,.11)); }
${ICON},${TOP_ICON},${RAIL_ICON}{ width:20px; height:20px; display:inline-flex; align-items:center; justify-content:center; color:currentColor; flex:0 0 20px; }
${ICON} svg,${TOP_ICON} svg,${RAIL_ICON} svg{ width:20px; height:20px; display:block; }
${RAIL}{
  box-sizing:border-box;
  color:inherit;
  user-select:none;
}
${RAIL}:hover{ background: var(--interactive-bg-secondary-hover, rgba(255,255,255,.08)); }
${ROW} [${ATTR_CGXUI_STATE}="label"],
${TOP_ROW} [${ATTR_CGXUI_STATE}="label"]{ min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px; font-weight:500; }
${TOP}[data-h2o-library-rail="1"]{
  width:100%;
  max-width:100%;
  overflow:hidden;
}
${TOP}[data-h2o-library-rail="1"] > [data-sidebar-item="true"]{
  width:100%;
  min-width:0;
  max-width:100%;
  overflow:hidden;
  justify-content:center;
  padding-left:0;
  padding-right:0;
}
${TOP}[data-h2o-library-rail="1"] > [data-sidebar-item="true"] > .flex{
  width:100%;
  min-width:0;
  justify-content:center;
  gap:0;
}
${TOP}[data-h2o-library-rail="1"] [${ATTR_CGXUI_STATE}="label-wrap"],
${TOP}[data-h2o-library-rail="1"] [${ATTR_CGXUI_STATE}="label"],
${TOP}[data-h2o-library-rail="1"] .trailing{
  display:none !important;
}

${PAGE_HOST}{
  min-height:100%; width:100%; flex:1 1 auto;
  display:flex; align-items:stretch; justify-content:center;
  box-sizing:border-box; overflow:visible;
  background:var(--main-surface-primary, #212121);
  color:var(--text-primary, #fff);
}
${PAGE}{
  --thread-content-max-width: 56rem;
  width:min(94cqw, var(--thread-content-max-width));
  max-width:var(--thread-content-max-width);
  min-height:100%;
  margin:0 auto;
  padding:54px 0 34px;
  color:var(--text-primary, #fff);
  display:grid;
  grid-template-rows:auto auto minmax(0,1fr);
  align-content:start;
  gap:16px;
  font:14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
${PAGE} *{ box-sizing:border-box; }
${PAGE} button,
${PAGE} input{ font:inherit; }
${PAGE} [${ATTR_CGXUI_STATE}="head"]{ display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding-bottom:2px; }
${PAGE} [${ATTR_CGXUI_STATE}="title-row"]{ display:flex; min-width:0; align-items:center; gap:12px; }
${PAGE} [${ATTR_CGXUI_STATE}="title-icon"]{ width:34px; height:34px; display:inline-flex; align-items:center; justify-content:center; color:#7dd3fc; border-radius:10px; background:rgba(125,211,252,.10); }
${PAGE} [${ATTR_CGXUI_STATE}="title-icon"] svg{ width:23px; height:23px; }
${PAGE} h1{ margin:0; min-width:0; font-size:30px; line-height:36px; font-weight:600; letter-spacing:-.02em; }
${PAGE} [${ATTR_CGXUI_STATE}="sub"]{ margin-top:6px; color:var(--text-secondary, rgba(255,255,255,.70)); font-size:13px; }
${PAGE} [${ATTR_CGXUI_STATE}="head-actions"]{ display:flex; align-items:center; gap:8px; flex:0 0 auto; }
${PAGE} [${ATTR_CGXUI_STATE}="icon-btn"]{ width:34px; height:34px; border:1px solid rgba(255,255,255,.12); border-radius:11px; display:inline-flex; align-items:center; justify-content:center; background:rgba(255,255,255,.04); color:inherit; cursor:pointer; opacity:.86; }
${PAGE} [${ATTR_CGXUI_STATE}="icon-btn"]:hover{ background:rgba(255,255,255,.08); opacity:1; }
${PAGE} [${ATTR_CGXUI_STATE}="icon-btn"] svg{ width:18px; height:18px; }
${PAGE} [${ATTR_CGXUI_STATE}="toolbar"]{ display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:center; }
${PAGE} [${ATTR_CGXUI_STATE}="search"]{ width:100%; min-height:40px; border:1px solid rgba(255,255,255,.12); border-radius:14px; padding:0 14px; background:rgba(255,255,255,.055); color:var(--text-primary, #fff); outline:none; }
${PAGE} [${ATTR_CGXUI_STATE}="search"]:focus{ border-color:rgba(125,211,252,.45); box-shadow:0 0 0 3px rgba(125,211,252,.10); }
${PAGE} [${ATTR_CGXUI_STATE}="tabs"]{ display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
${PAGE} [${ATTR_CGXUI_STATE}="tab"]{ border:0; border-radius:999px; padding:8px 13px; background:transparent; color:var(--text-secondary, rgba(255,255,255,.72)); cursor:pointer; }
${PAGE} [${ATTR_CGXUI_STATE}="tab"]:hover{ background:rgba(255,255,255,.07); color:var(--text-primary, #fff); }
${PAGE} [${ATTR_CGXUI_STATE}="tab"][aria-selected="true"]{ background:var(--interactive-bg-secondary-press, rgba(255,255,255,.12)); color:var(--text-primary, #fff); }
${PAGE} [${ATTR_CGXUI_STATE}="body"]{ min-width:0; }
${PAGE} [${ATTR_CGXUI_STATE}="loading"],
${PAGE} [${ATTR_CGXUI_STATE}="empty"]{ padding:28px 14px; border:1px solid rgba(255,255,255,.10); border-radius:16px; color:var(--text-secondary, rgba(255,255,255,.70)); background:rgba(255,255,255,.035); }
${PAGE} [${ATTR_CGXUI_STATE}="card-grid"]{ display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:10px; margin-bottom:14px; }
${PAGE} [${ATTR_CGXUI_STATE}="card"]{ border:1px solid rgba(255,255,255,.10); border-radius:16px; padding:14px; background:rgba(255,255,255,.04); min-height:94px; }
${PAGE} [${ATTR_CGXUI_STATE}="card-label"]{ color:var(--text-secondary, rgba(255,255,255,.68)); font-size:12px; }
${PAGE} [${ATTR_CGXUI_STATE}="card-value"]{ margin-top:7px; font-size:26px; line-height:30px; font-weight:650; letter-spacing:-.02em; }
${PAGE} [${ATTR_CGXUI_STATE}="card-note"]{ margin-top:6px; color:var(--text-tertiary, rgba(255,255,255,.48)); font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
${PAGE} [${ATTR_CGXUI_STATE}="section-title"]{ display:flex; align-items:end; justify-content:space-between; gap:12px; margin:18px 0 8px; color:var(--text-secondary, rgba(255,255,255,.72)); font-size:12px; font-weight:650; letter-spacing:.01em; text-transform:uppercase; }
${PAGE} [${ATTR_CGXUI_STATE}="section-title"] span{ color:var(--text-tertiary, rgba(255,255,255,.48)); font-weight:500; text-transform:none; }
${PAGE} [${ATTR_CGXUI_STATE}="list"]{ border:1px solid rgba(255,255,255,.10); border-radius:16px; overflow:hidden; background:rgba(255,255,255,.028); }
${PAGE} [${ATTR_CGXUI_STATE}="row"]{ min-height:56px; display:flex; align-items:center; gap:12px; padding:11px 13px; border-bottom:1px solid rgba(255,255,255,.08); color:inherit; text-decoration:none; background:transparent; width:100%; text-align:left; }
${PAGE} [${ATTR_CGXUI_STATE}="row"]:last-child{ border-bottom:0; }
${PAGE} a[${ATTR_CGXUI_STATE}="row"]:hover,
${PAGE} button[${ATTR_CGXUI_STATE}="row"]:hover{ background:rgba(255,255,255,.06); }
${PAGE} [${ATTR_CGXUI_STATE}="row-icon"]{ width:28px; height:28px; border-radius:9px; display:inline-flex; align-items:center; justify-content:center; flex:0 0 28px; background:rgba(125,211,252,.10); color:#7dd3fc; font-weight:650; }
${PAGE} [${ATTR_CGXUI_STATE}="row-body"]{ min-width:0; flex:1 1 auto; }
${PAGE} [${ATTR_CGXUI_STATE}="row-title"]{ min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px; font-weight:560; }
${PAGE} [${ATTR_CGXUI_STATE}="row-sub"]{ min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-secondary, rgba(255,255,255,.68)); font-size:12px; margin-top:3px; }
${PAGE} [${ATTR_CGXUI_STATE}="pills"]{ display:flex; align-items:center; gap:5px; flex-wrap:wrap; justify-content:flex-end; max-width:260px; }
${PAGE} [${ATTR_CGXUI_STATE}="pill"]{ display:inline-flex; align-items:center; min-height:22px; max-width:140px; padding:3px 8px; border-radius:999px; background:rgba(255,255,255,.075); color:var(--text-secondary, rgba(255,255,255,.75)); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
${PAGE} [${ATTR_CGXUI_STATE}="dot"]{ width:11px; height:11px; border-radius:999px; flex:0 0 11px; box-shadow:0 0 0 1px rgba(255,255,255,.16) inset; }
${PAGE} [${ATTR_CGXUI_STATE}="notice-grid"]{ display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:10px; }
${PAGE} [${ATTR_CGXUI_STATE}="notice"]{ border:1px solid rgba(255,255,255,.10); border-radius:16px; padding:13px; background:rgba(255,255,255,.035); }
${PAGE} [${ATTR_CGXUI_STATE}="notice"] strong{ display:block; margin-bottom:5px; }
${PAGE} [${ATTR_CGXUI_STATE}="notice"] div{ color:var(--text-secondary, rgba(255,255,255,.68)); font-size:12px; }
${PAGE} [${ATTR_CGXUI_STATE}="quick-actions"]{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:10px 0 4px; }
${PAGE} [${ATTR_CGXUI_STATE}="quick-action"]{ border:1px solid rgba(255,255,255,.10); border-radius:999px; padding:8px 12px; background:rgba(255,255,255,.045); color:var(--text-primary,#fff); cursor:pointer; font-size:13px; }
${PAGE} [${ATTR_CGXUI_STATE}="quick-action"]:hover{ background:rgba(255,255,255,.08); }
${PAGE} [${ATTR_CGXUI_STATE}="quick-action"][data-primary="true"]{ background:rgba(125,211,252,.14); border-color:rgba(125,211,252,.28); color:#e5f8ff; }
@media (max-width: 780px){
  ${PAGE}{ width:min(96cqw, 100%); padding:38px 12px 28px; }
  ${PAGE} [${ATTR_CGXUI_STATE}="toolbar"]{ grid-template-columns:1fr; }
  ${PAGE} [${ATTR_CGXUI_STATE}="card-grid"],
  ${PAGE} [${ATTR_CGXUI_STATE}="notice-grid"]{ grid-template-columns:1fr; }
  ${PAGE} [${ATTR_CGXUI_STATE}="pills"]{ display:none; }
}
`;
    }

    function extendRouteServiceForLibrary() {
      const svc = getRouteService();
      if (!svc || svc.__h2oLibraryWorkspaceRoutePatchV1) return false;
      try {
        const base = {
          makeHash: svc.ROUTE_makeHash?.bind(svc),
          makeUrl: svc.ROUTE_makeUrl?.bind(svc),
          parseUrl: svc.ROUTE_parseUrl?.bind(svc),
          parseHash: svc.ROUTE_parseHash?.bind(svc),
        };

        const shouldParseGenericView = (view) => {
          const v = String(view || '').trim();
          if (!v) return false;
          if (['projects', 'folder', 'categories', 'category'].includes(v)) return false;
          return v === 'library' || typeof core.getRoute?.(v) === 'function';
        };

        svc.ROUTE_makeHash = function patchedMakeHash(env, route = {}) {
          const view = String(route?.view || '').trim();
          if (shouldParseGenericView(view)) {
            const id = String(route?.id || '').trim();
            const prefix = String(env?.CFG_H2O_PAGE_ROUTE_PREFIX || CFG_H2O_PAGE_ROUTE_PREFIX);
            return id ? `#${prefix}/${encodeURIComponent(view)}/${encodeURIComponent(id)}` : `#${prefix}/${encodeURIComponent(view)}`;
          }
          return base.makeHash ? base.makeHash(env, route) : '';
        };

        svc.ROUTE_makeUrl = function patchedMakeUrl(env, route = {}) {
          const view = String(route?.view || '').trim();
          if (shouldParseGenericView(view)) {
            const url = new URL('/', env?.W?.location?.origin || W.location.origin);
            url.searchParams.set(env?.CFG_H2O_PAGE_QUERY_FLAG || CFG_H2O_PAGE_QUERY_FLAG, '1');
            url.searchParams.set(env?.CFG_H2O_PAGE_QUERY_VIEW || CFG_H2O_PAGE_QUERY_VIEW, view);
            const id = String(route?.id || '').trim();
            if (id) url.searchParams.set(env?.CFG_H2O_PAGE_QUERY_ID || CFG_H2O_PAGE_QUERY_ID, id);
            return `${url.pathname}${url.search}`;
          }
          return base.makeUrl ? base.makeUrl(env, route) : '';
        };

        svc.ROUTE_parseUrl = function patchedParseUrl(env, input = env?.W?.location?.href || W.location.href) {
          const original = base.parseUrl ? base.parseUrl(env, input) : null;
          if (original) return original;
          let url;
          try {
            url = input instanceof URL ? input : new URL(String(input || W.location.href), env?.W?.location?.href || W.location.href);
          } catch {
            return null;
          }
          const flag = env?.CFG_H2O_PAGE_QUERY_FLAG || CFG_H2O_PAGE_QUERY_FLAG;
          const viewKey = env?.CFG_H2O_PAGE_QUERY_VIEW || CFG_H2O_PAGE_QUERY_VIEW;
          const idKey = env?.CFG_H2O_PAGE_QUERY_ID || CFG_H2O_PAGE_QUERY_ID;
          if (url.searchParams.get(flag) !== '1') return null;
          const view = String(url.searchParams.get(viewKey) || '').trim();
          if (!shouldParseGenericView(view)) return null;
          return { view, id: String(url.searchParams.get(idKey) || '').trim() };
        };

        svc.ROUTE_parseHash = function patchedParseHash(env, hash = env?.W?.location?.hash || W.location.hash) {
          const original = base.parseHash ? base.parseHash(env, hash) : null;
          if (original) return original;
          const raw = String(hash || '').replace(/^#/, '');
          const parts = raw.split('/').filter(Boolean);
          const prefix = String(env?.CFG_H2O_PAGE_ROUTE_PREFIX || CFG_H2O_PAGE_ROUTE_PREFIX);
          if (parts[0] !== prefix || !parts[1]) return null;
          let view = '';
          try { view = decodeURIComponent(parts[1]); } catch { view = parts[1]; }
          if (!shouldParseGenericView(view)) return null;
          let id = '';
          if (parts[2]) {
            try { id = decodeURIComponent(parts.slice(2).join('/')); } catch { id = parts.slice(2).join('/'); }
          }
          return { view, id };
        };

        Object.defineProperty(svc, '__h2oLibraryWorkspaceRoutePatchV1', {
          value: { ok: true, ts: Date.now(), source: MOD.meta.owner },
          configurable: true,
        });
        step('route-service-extended', 'generic-library-route');
        return true;
      } catch (error) {
        err('extend-route-service', error);
        return false;
      }
    }

    function parseLibraryRoute(input = W.location.href) {
      let route = null;
      try {
        route = getRouteService()?.ROUTE_parseUrl?.(libraryEnv(), input) || null;
      } catch {}
      if (!route) {
        try {
          route = parseLibraryRouteLocal(input) || parseLibraryHashLocal(W.location.hash);
        } catch {}
      }
      if (route?.view !== 'library') return null;
      return {
        view: 'library',
        id: '',
        baseHref: String(getSafeBaseHref()),
      };
    }

    function parseLibraryRouteLocal(input = W.location.href) {
      let url;
      try { url = input instanceof URL ? input : new URL(String(input || W.location.href), W.location.href); }
      catch { return null; }
      if (url.searchParams.get(CFG_H2O_PAGE_QUERY_FLAG) !== '1') return null;
      const view = String(url.searchParams.get(CFG_H2O_PAGE_QUERY_VIEW) || '').trim();
      return view === 'library' ? { view: 'library', id: '' } : null;
    }

    function getLibraryRouteHref() {
      try {
        return String(getRouteService()?.ROUTE_makeUrl?.(libraryEnv(), { view: 'library', id: '' }) || '/?h2o_flsc=1&h2o_flsc_view=library');
      } catch {
        return '/?h2o_flsc=1&h2o_flsc_view=library';
      }
    }

    function getSafeBaseHref() {
      try { return `${W.location.origin}/`; } catch {}
      return '/';
    }

    function parseLibraryHashLocal(hash = W.location.hash) {
      const raw = String(hash || '').replace(/^#/, '');
      const parts = raw.split('/').filter(Boolean);
      if (parts[0] !== CFG_H2O_PAGE_ROUTE_PREFIX) return null;
      return parts[1] === 'library' ? { view: 'library', id: '' } : null;
    }

    function getCurrentBaseHref() {
      const h2o = (W.history?.state && typeof W.history.state === 'object') ? W.history.state.h2o : null;
      if (h2o?.owner === CFG_H2O_PAGE_ROUTE_OWNER && (h2o.returnHref || h2o.baseHref)) {
        return getSafeBaseHref();
      }
      const href = String(W.location.href || '');
      try {
        const url = new URL(href, W.location.origin);
        if (parseLibraryRouteLocal(url)) return getSafeBaseHref();
        url.searchParams.delete(CFG_H2O_PAGE_QUERY_FLAG);
        url.searchParams.delete(CFG_H2O_PAGE_QUERY_VIEW);
        url.searchParams.delete(CFG_H2O_PAGE_QUERY_ID);
        if (String(url.hash || '').startsWith(`#${CFG_H2O_PAGE_ROUTE_PREFIX}/`)) url.hash = '';
        return url.href;
      } catch {}
      return href.split('#')[0];
    }

    function commitLibraryRoute(opts = {}) {
      const route = { view: 'library', id: '' };
      const routeSvc = getRouteService();
      try {
        if (routeSvc?.ROUTE_commitPageRoute) {
          routeSvc.ROUTE_commitPageRoute(libraryEnv(), route, opts);
          return true;
        }
      } catch (error) {
        err('commit-route-core', error);
      }

      if (opts.fromRoute || opts.skipHistory) return false;
      try {
        const url = new URL('/', W.location.origin);
        url.searchParams.set(CFG_H2O_PAGE_QUERY_FLAG, '1');
        url.searchParams.set(CFG_H2O_PAGE_QUERY_VIEW, 'library');
        const baseHref = getSafeBaseHref();
        const current = (W.history?.state && typeof W.history.state === 'object') ? W.history.state : {};
        const nextState = {
          ...current,
          h2o: {
            owner: CFG_H2O_PAGE_ROUTE_OWNER,
            view: 'library',
            id: '',
            returnHref: String(baseHref),
            baseHref: String(baseHref),
          },
        };
        W.history.pushState(nextState, '', `${url.pathname}${url.search}`);
        state.pageRoute = { view: 'library', id: '', baseHref: String(baseHref) };
        return true;
      } catch (error) {
        err('commit-route-local', error);
        return false;
      }
    }

    function closeWorkspace(opts = {}) {
      try { getPageHostService()?.UI_restoreInShellPage?.(libraryEnv(), opts.reason || 'close-library'); } catch (error) { err('close-page-host', error); }
      safeRemove(state.viewerEl);
      state.viewerEl = null;
      state.pageEl = null;
      state.pageHost = null;
      state.pageRoute = null;
      syncSidebarActiveState();
      scheduleLibraryActiveSyncPair('close-workspace');

      if (!opts.skipHistory && parseLibraryRoute(W.location.href)) {
        try {
          const baseHref = getSafeBaseHref();
          W.history.pushState({}, '', baseHref || '/');
          scheduleLibraryActiveSyncPair('close-workspace-history');
        } catch (error) {
          err('close-route', error);
        }
      }
    }

    function mountPage(page) {
      const svc = getPageHostService();
      try {
        if (svc?.UI_mountInShellPage?.(libraryEnv(), page)) return true;
      } catch (error) {
        err('mount-page-core', error);
      }

      // Safe fallback only. Normal path should mount into ChatGPT right-pane host.
      closeWorkspace({ skipHistory: true, reason: 'fallback-before-mount' });
      const viewer = D.createElement('div');
      viewer.setAttribute(ATTR_CGXUI, UI_LIBRARY_VIEWER);
      viewer.setAttribute(ATTR_CGXUI_OWNER, SkID);
      viewer.setAttribute(ATTR_CGXUI_MODE, 'panel');
      viewer.style.cssText = `position:fixed;inset:0;z-index:${CFG_FLOATING_Z};overflow:auto;background:var(--main-surface-primary,#212121);`;
      viewer.appendChild(page);
      D.body.appendChild(viewer);
      state.viewerEl = viewer;
      state.clean.nodes.add(viewer);
      return true;
    }

    function makeWorkspacePage() {
      ensureStyle();
      const page = D.createElement('div');
      page.setAttribute(ATTR_CGXUI, UI_LIBRARY_PAGE);
      page.setAttribute(ATTR_CGXUI_OWNER, SkID);
      page.setAttribute('data-cgxui-page-kind', 'library');
      page.setAttribute('data-cgxui-page-title', 'Library');

      const head = D.createElement('div');
      head.setAttribute(ATTR_CGXUI_STATE, 'head');

      const titleWrap = D.createElement('div');
      titleWrap.style.minWidth = '0';
      const titleRow = D.createElement('div');
      titleRow.setAttribute(ATTR_CGXUI_STATE, 'title-row');
      const icon = D.createElement('span');
      icon.setAttribute(ATTR_CGXUI_STATE, 'title-icon');
      icon.innerHTML = FRAG_SVG_LIBRARY;
      const h1 = D.createElement('h1');
      h1.textContent = 'Library';
      titleRow.appendChild(icon);
      titleRow.appendChild(h1);
      const sub = D.createElement('div');
      sub.setAttribute(ATTR_CGXUI_STATE, 'sub');
      sub.textContent = 'Loading library sources…';
      titleWrap.appendChild(titleRow);
      titleWrap.appendChild(sub);

      const actions = D.createElement('div');
      actions.setAttribute(ATTR_CGXUI_STATE, 'head-actions');
      const refresh = D.createElement('button');
      refresh.type = 'button';
      refresh.setAttribute(ATTR_CGXUI_STATE, 'icon-btn');
      refresh.setAttribute('aria-label', 'Refresh Library');
      refresh.title = 'Refresh Library';
      refresh.innerHTML = FRAG_SVG_REFRESH;
      refresh.onclick = () => loadAndRender('manual-refresh').catch((error) => err('refresh-click', error));
      actions.appendChild(refresh);

      head.appendChild(titleWrap);
      head.appendChild(actions);

      const toolbar = D.createElement('div');
      toolbar.setAttribute(ATTR_CGXUI_STATE, 'toolbar');
      const search = D.createElement('input');
      search.type = 'search';
      search.placeholder = 'Search chats, folders, labels, categories, projects…';
      search.autocomplete = 'off';
      search.spellcheck = false;
      search.setAttribute(ATTR_CGXUI_STATE, 'search');
      search.value = readUi().query || '';
      search.oninput = () => {
        if (state.searchTimer) W.clearTimeout(state.searchTimer);
        state.searchTimer = W.setTimeout(() => {
          state.clean.timers.delete(state.searchTimer);
          state.searchTimer = 0;
          writeUi({ query: search.value });
          renderWorkspaceBody();
        }, CFG_SEARCH_DEBOUNCE_MS);
        state.clean.timers.add(state.searchTimer);
      };

      const tabs = D.createElement('div');
      tabs.setAttribute(ATTR_CGXUI_STATE, 'tabs');
      TABS.forEach((tab) => {
        const btn = D.createElement('button');
        btn.type = 'button';
        btn.setAttribute(ATTR_CGXUI_STATE, 'tab');
        btn.setAttribute('data-h2o-library-tab', tab.key);
        btn.textContent = tab.label;
        btn.onclick = () => {
          writeUi({ tab: tab.key });
          syncTabs();
          renderWorkspaceBody();
        };
        tabs.appendChild(btn);
      });
      toolbar.appendChild(search);
      toolbar.appendChild(tabs);

      const body = D.createElement('div');
      body.setAttribute(ATTR_CGXUI_STATE, 'body');
      body.innerHTML = `<div ${ATTR_CGXUI_STATE}="loading">Loading Library…</div>`;

      page.appendChild(head);
      page.appendChild(toolbar);
      page.appendChild(body);
      return page;
    }

    async function openWorkspace(opts = {}) {
      ensureStyle();
      ensureInjected('open-workspace');
      extendRouteServiceForLibrary();

      if (!state.pageEl || !state.pageEl.isConnected || state.pageEl.getAttribute('data-cgxui-page-kind') !== 'library') {
        const page = makeWorkspacePage();
        mountPage(page);
        state.pageEl = page;
      }

      if (!opts.fromRoute && !opts.skipHistory) commitLibraryRoute(opts);
      state.pageRoute = { view: 'library', id: '', baseHref: String(getSafeBaseHref()) };
      syncSidebarActiveState();
      scheduleLibraryActiveSyncPair('open-workspace');
      syncTabs();
      safeDispatch('evt:h2o:library-workspace:open', { source: opts.source || 'api', ts: Date.now() });
      await loadAndRender(opts.reason || 'open');
      return state.pageEl;
    }

    async function loadAndRender(reason = 'load') {
      if (!state.pageEl?.isConnected) return null;
      const body = state.pageEl.querySelector(`[${ATTR_CGXUI_STATE}="body"]`);
      if (body && !state.model) body.innerHTML = `<div ${ATTR_CGXUI_STATE}="loading">Loading Library…</div>`;
      state.loading = true;
      try {
        const model = await buildLibraryModel(reason);
        state.model = model;
        updateSubtitle(model);
        renderWorkspaceBody();
        step('model-loaded', `${reason}:${model.counts.chats} chats`);
        return model;
      } catch (error) {
        err('load-model', error);
        if (body) body.innerHTML = `<div ${ATTR_CGXUI_STATE}="empty">Library could not load cleanly. Check H2O.LibraryWorkspace.selfCheck().</div>`;
        return null;
      } finally {
        state.loading = false;
      }
    }

    function updateSubtitle(model = state.model) {
      const sub = state.pageEl?.querySelector?.(`[${ATTR_CGXUI_STATE}="sub"]`);
      if (!sub || !model) return;
      const c = model.counts || {};
      sub.textContent = `${c.savedChats ?? c.chats ?? 0} saved chats · ${c.recentChats || 0} recent chats · ${c.folders || 0} folders · ${c.labels || 0} labels · ${c.categories || 0} categories · ${c.projects || 0} projects`;
    }

    function syncTabs() {
      const page = state.pageEl;
      if (!page) return;
      const ui = readUi();
      page.querySelectorAll(`[${ATTR_CGXUI_STATE}="tab"]`).forEach((btn) => {
        btn.setAttribute('aria-selected', btn.getAttribute('data-h2o-library-tab') === ui.tab ? 'true' : 'false');
      });
      const search = page.querySelector(`[${ATTR_CGXUI_STATE}="search"]`);
      if (search && search.value !== ui.query) search.value = ui.query;
    }

    function renderWorkspaceBody() {
      const page = state.pageEl;
      const model = state.model;
      const body = page?.querySelector?.(`[${ATTR_CGXUI_STATE}="body"]`);
      if (!page || !body) return;
      syncTabs();
      if (!model) {
        body.innerHTML = `<div ${ATTR_CGXUI_STATE}="loading">Loading Library…</div>`;
        return;
      }
      const ui = readUi();
      const q = lowerText(ui.query);
      const tab = ui.tab;
      body.innerHTML = '';

      if (tab === 'dashboard') return renderDashboard(body, model, q);
      if (tab === 'explorer') return renderInsightsTab(body, model, q, 'explorer');
      if (tab === 'analytics') return renderInsightsTab(body, model, q, 'analytics');
      if (tab === 'saved') return renderChats(body, filterRows(model.savedChats || [], q), 'Saved chats');
      if (tab === 'recent') return renderChats(body, filterRows(model.recentChats || [], q), 'Recent chats');
      if (tab === 'folders') return renderFolders(body, filterRows(model.folders, q));
      if (tab === 'labels') return renderLabels(body, filterRows(model.labels, q));
      if (tab === 'categories') return renderCategories(body, filterRows(model.categories, q));
      if (tab === 'projects') return renderProjects(body, filterRows(model.projects, q));
      if (tab === 'organize') return renderOrganize(body, model, q);
      renderDashboard(body, model, q);
    }

    function filterRows(rows, query) {
      const q = lowerText(query);
      const src = Array.isArray(rows) ? rows : [];
      if (!q) return src.slice();
      return src.filter((row) => lowerText([
        row.title, row.name, row.label, row.typeLabel, row.folderName, row.projectName,
        row.categoryText, row.labelText, row.tagText, row.source, row.href, row.chatId,
      ].filter(Boolean).join(' ')).includes(q));
    }

    function appendSectionTitle(parent, title, countText = '') {
      const el = D.createElement('div');
      el.setAttribute(ATTR_CGXUI_STATE, 'section-title');
      el.innerHTML = `<strong>${escapeHtml(title)}</strong>${countText ? `<span>${escapeHtml(countText)}</span>` : ''}`;
      parent.appendChild(el);
      return el;
    }

    function makeCard(label, value, note = '') {
      const card = D.createElement('div');
      card.setAttribute(ATTR_CGXUI_STATE, 'card');
      card.innerHTML = `
        <div ${ATTR_CGXUI_STATE}="card-label">${escapeHtml(label)}</div>
        <div ${ATTR_CGXUI_STATE}="card-value">${escapeHtml(String(value ?? 0))}</div>
        <div ${ATTR_CGXUI_STATE}="card-note">${escapeHtml(note || '')}</div>
      `;
      return card;
    }

    function renderCards(parent, cards) {
      const grid = D.createElement('div');
      grid.setAttribute(ATTR_CGXUI_STATE, 'card-grid');
      cards.forEach((card) => grid.appendChild(makeCard(card.label, card.value, card.note)));
      parent.appendChild(grid);
    }

    function switchWorkspaceTab(tabKey) {
      writeUi({ tab: normalizeTabKey(tabKey) });
      syncTabs();
      renderWorkspaceBody();
    }

    function getLibraryIndexApi() {
      return core.getService?.('library-index') || core.getOwner?.('library-index') || H2O.LibraryIndex || null;
    }

    function getLibraryInsightsApi() {
      return H2O.LibraryInsights || core.getService?.('library-insights') || core.getOwner?.('library-insights') || null;
    }

    function isLibraryIndexFresh(index = getLibraryIndexApi()) {
      if (!index) return false;
      try {
        if (typeof index.isCacheFresh === 'function') return !!index.isCacheFresh();
      } catch (error) {
        err('library-index-fresh', error);
      }
      return false;
    }

    function isUsableWorkspaceModel(model) {
      if (!model || typeof model !== 'object' || model.ok === false) return false;
      return Array.isArray(model.knownChats) || Array.isArray(model.chats) || Array.isArray(model.savedChats);
    }

    function markWorkspaceModelSource(model, source, degradedReason = '') {
      const next = {
        ...(model && typeof model === 'object' ? model : {}),
        ok: model?.ok !== false,
        source,
        sourceModel: source,
        degraded: source === 'workspace-fallback',
        degradedReason: source === 'workspace-fallback' ? String(degradedReason || 'library-index-unavailable') : '',
      };
      state.lastModelSource = next.source;
      state.lastDegradedReason = next.degradedReason || '';
      return next;
    }

    function adaptIndexModelForWorkspace(indexModel) {
      if (!indexModel || typeof indexModel !== 'object' || indexModel.ok === false) return null;
      const chats = Array.isArray(indexModel.chats) ? indexModel.chats : (Array.isArray(indexModel.knownChats) ? indexModel.knownChats : []);
      const savedChats = Array.isArray(indexModel.savedChats) ? indexModel.savedChats : chats.filter((chat) => chat.isSaved || chat.saved);
      const recentChats = Array.isArray(indexModel.recentChats) ? indexModel.recentChats : chats.filter((chat) => chat.isRecent || chat.recent);
      const counts = indexModel.counts || {};
      return {
        ok: true,
        builtAt: indexModel.builtAt || Date.now(),
        durationMs: indexModel.durationMs || 0,
        degraded: false,
        degradedReason: '',
        source: 'library-index',
        sourceModel: 'library-index',
        sourceStatus: indexModel.sourceStatus || null,
        sources: { ...(indexModel.sourceStatus || availableSources()), libraryIndex: true, libraryInsights: !!getLibraryInsightsApi() },
        counts: {
          chats: savedChats.length,
          savedChats: Number(counts.savedChats ?? savedChats.length) || 0,
          recentChats: Number(counts.recentChats ?? recentChats.length) || 0,
          allChats: Number(counts.knownChats ?? counts.allChats ?? chats.length) || 0,
          knownChats: Number(counts.knownChats ?? chats.length) || 0,
          folders: Number(counts.folders ?? (indexModel.folders || []).length) || 0,
          labels: Number(counts.labels ?? (indexModel.labels || []).length) || 0,
          categories: Number(counts.categories ?? (indexModel.categories || []).length) || 0,
          projects: Number(counts.projects ?? (indexModel.projects || []).length) || 0,
          unfiled: Number(counts.unfiledSaved ?? counts.unfiled ?? 0) || 0,
          needsLabel: Number(counts.unlabeledSaved ?? counts.needsLabel ?? 0) || 0,
          uncategorized: Number(counts.uncategorizedSaved ?? counts.uncategorized ?? 0) || 0,
          needsOrganization: Number(counts.needsOrganization ?? 0) || 0,
          importantOrPinned: Number(counts.importantOrPinned ?? 0) || 0,
        },
        chats,
        knownChats: Array.isArray(indexModel.knownChats) ? indexModel.knownChats : chats,
        savedChats,
        recentChats,
        folders: Array.isArray(indexModel.folders) ? indexModel.folders : [],
        labels: Array.isArray(indexModel.labels) ? indexModel.labels : [],
        categories: Array.isArray(indexModel.categories) ? indexModel.categories : [],
        projects: Array.isArray(indexModel.projects) ? indexModel.projects : [],
        tags: Array.isArray(indexModel.tags) ? indexModel.tags : [],
        facets: indexModel.facets || null,
        indexModel,
      };
    }

    async function buildLibraryModelFromIndex(reason = 'workspace-refresh') {
      const index = getLibraryIndexApi();
      state.hasLibraryIndex = !!index;
      state.indexModelFresh = false;
      if (!index) {
        state.lastIndexFailureReason = 'library-index-unavailable';
        return null;
      }
      try {
        let model = null;
        if (typeof index.getModel === 'function') {
          model = index.getModel();
          if (model && typeof model.then === 'function') model = await model;
        }
        let fresh = isLibraryIndexFresh(index);
        if (typeof index.isCacheFresh !== 'function') fresh = !!model?.ok;
        if (!model || model.ok === false || !fresh) {
          if (typeof index.refresh !== 'function') {
            state.lastIndexFailureReason = fresh ? 'library-index-empty-model' : 'library-index-stale';
            return null;
          }
          model = await index.refresh(`library-workspace:${reason}`, { force: false });
          if ((!model || model.ok === false) && typeof index.getModel === 'function') {
            model = index.getModel();
            if (model && typeof model.then === 'function') model = await model;
          }
          fresh = isLibraryIndexFresh(index) || !!model?.ok;
        }
        state.indexModelFresh = !!fresh;
        const adapted = adaptIndexModelForWorkspace(model);
        if (!isUsableWorkspaceModel(adapted)) {
          state.lastIndexFailureReason = 'library-index-empty-model';
          return null;
        }
        state.lastIndexFailureReason = '';
        return markWorkspaceModelSource(adapted, 'library-index');
      } catch (error) {
        err('library-index-model', error);
        state.lastIndexFailureReason = 'library-index-error';
        return null;
      }
    }

    async function readModelFromIndex(reason = 'index-read') {
      const model = await buildLibraryModelFromIndex(reason);
      if (!model || !state.pageEl?.isConnected) return null;
      state.model = model;
      updateSubtitle(model);
      renderWorkspaceBody();
      step('index-model-synced', `${reason}:${model.counts?.knownChats ?? model.counts?.allChats ?? 0}`);
      return model;
    }

    function bindLibraryIndexEventsOnce() {
      if (state.indexUpdateListenerBound) return;
      state.indexUpdateListenerBound = true;
      const onUpdated = (event) => {
        if (!state.pageEl?.isConnected) return;
        if (state.indexUpdateTimer) {
          try { W.clearTimeout(state.indexUpdateTimer); } catch {}
          state.clean.timers.delete(state.indexUpdateTimer);
        }
        state.indexUpdateTimer = W.setTimeout(() => {
          const timer = state.indexUpdateTimer;
          state.indexUpdateTimer = 0;
          state.clean.timers.delete(timer);
          readModelFromIndex(`event:${normText(event?.detail?.reason || 'library-index-updated')}`)
            .catch((error) => err('library-index-sync', error));
        }, 90);
        state.clean.timers.add(state.indexUpdateTimer);
      };
      W.addEventListener('evt:h2o:library-index:updated', onUpdated, true);
      state.clean.listeners.add(() => W.removeEventListener('evt:h2o:library-index:updated', onUpdated, true));
    }

    function renderInsightsMissing(body, mode = 'explorer') {
      const box = D.createElement('div');
      box.setAttribute(ATTR_CGXUI_STATE, 'empty');
      box.innerHTML = `Library Insights is not loaded. Install <strong>0F1d Library Insights</strong> to use ${escapeHtml(mode === 'analytics' ? 'Analytics' : 'Explorer')}.`;
      body.appendChild(box);
      return box;
    }

    function renderInsightsTab(body, model, q = '', mode = 'explorer') {
      const insights = getLibraryInsightsApi();
      const fn = mode === 'analytics' ? insights?.renderAnalytics : insights?.renderExplorer;
      if (typeof fn !== 'function') return renderInsightsMissing(body, mode);
      try {
        return fn({
          body,
          model,
          query: q,
          tab: mode,
          workspace: owner,
          switchTab: switchWorkspaceTab,
          requestRender: () => renderWorkspaceBody(),
          refreshWorkspace: (reason = 'insights-refresh') => loadAndRender(reason),
          attrs: { ATTR_CGXUI, ATTR_CGXUI_OWNER, ATTR_CGXUI_STATE, SkID },
        });
      } catch (error) {
        err(`library-insights:${mode}`, error);
        return renderInsightsMissing(body, mode);
      }
    }

    function renderDashboard(body, model, q = '') {
      const c = model.counts || {};
      const savedBase = Array.isArray(model.savedChats) ? model.savedChats : [];
      const recentBase = Array.isArray(model.recentChats) ? model.recentChats : [];

      const savedChats = filterRows(savedBase, q).slice(0, 6);
      const recentChats = filterRows(recentBase, q).slice(0, 6);

      // Dashboard contract:
      // - objective counts only
      // - saved and native recent chats stay separate
      // - no guessed intent labels such as "continue working"
      // - no duplicate tab shortcut buttons
      // - no organization warnings here; cleanup belongs in the Organize tab
      renderCards(body, [
        { label: 'Saved chats', value: c.savedChats ?? c.chats ?? 0, note: 'Captured / saved Library chats' },
        { label: 'Recent chats', value: c.recentChats || 0, note: 'Native ChatGPT Recents currently discoverable' },
        { label: 'Folders', value: c.folders || 0, note: 'Folder groups' },
        { label: 'Labels', value: c.labels || 0, note: 'Manual chat labels' },
        { label: 'Categories', value: c.categories || 0, note: 'Category groups' },
        { label: 'Projects', value: c.projects || 0, note: 'Native project cache / DOM' },
      ]);

      renderChats(body, savedChats, q ? 'Matching saved chats' : 'Latest saved chats');
      renderChats(body, recentChats, q ? 'Matching recent chats' : 'Latest recent chats');
      renderLibrarySourceStatus(body, model);
    }

    function renderLibrarySourceStatus(body, model) {
      const sources = model.sources || availableSources();
      const c = model.counts || {};
      const sourceRows = [
        { id: 'saved', title: 'Saved source', count: c.savedChats ?? c.chats ?? 0, available: !!sources.archive, note: 'H2O archive / saved chat rows' },
        { id: 'recents', title: 'Recent source', count: c.recentChats || 0, available: !!sources.recents, note: 'Native ChatGPT Recents discoverable via DOM/cache' },
        { id: 'folders', title: 'Folders source', count: c.folders || 0, available: !!sources.folders, note: 'Folders owner/service' },
        { id: 'labels', title: 'Labels source', count: c.labels || 0, available: !!sources.labels, note: 'Labels owner/service' },
        { id: 'categories', title: 'Categories source', count: c.categories || 0, available: !!sources.categories, note: 'Categories owner/service' },
        { id: 'projects', title: 'Projects source', count: c.projects || 0, available: !!sources.projects, note: 'Projects owner/service or native DOM' },
      ];

      appendSectionTitle(body, 'Library sources', `${sourceRows.filter((row) => row.available).length}/${sourceRows.length} available`);
      makeList(body, sourceRows.map((row) => ({
        icon: row.available ? '✓' : '–',
        title: row.title,
        subText: `${row.available ? 'Available' : 'Unavailable'} · ${row.count} found · ${row.note}`,
        pills: [row.id],
      })), 'No source status available.');
    }

    // Backward-compatible alias for older internal callers/storage names.
    function renderOverview(body, model, q = '') {
      return renderDashboard(body, model, q);
    }

    function makeRow(row, opts = {}) {
      const href = String(opts.href || row.href || row.url || '').trim();
      const clickable = !!href && !opts.noLink;
      const el = D.createElement(clickable ? 'a' : 'div');
      el.setAttribute(ATTR_CGXUI_STATE, 'row');
      if (clickable) el.setAttribute('href', href);
      const iconText = String(opts.icon || row.icon || '•').slice(0, 2);
      const sub = opts.subText || row.subText || row.subtitle || '';
      const pills = Array.isArray(opts.pills) ? opts.pills : (Array.isArray(row.pills) ? row.pills : []);
      el.innerHTML = `
        <span ${ATTR_CGXUI_STATE}="row-icon">${escapeHtml(iconText)}</span>
        <span ${ATTR_CGXUI_STATE}="row-body">
          <span ${ATTR_CGXUI_STATE}="row-title">${escapeHtml(opts.title || row.title || row.name || row.label || row.id || 'Untitled')}</span>
          <span ${ATTR_CGXUI_STATE}="row-sub">${escapeHtml(sub)}</span>
        </span>
      `;
      if (pills.length) {
        const wrap = D.createElement('span');
        wrap.setAttribute(ATTR_CGXUI_STATE, 'pills');
        pills.slice(0, 5).forEach((pill) => {
          const span = D.createElement('span');
          span.setAttribute(ATTR_CGXUI_STATE, 'pill');
          span.textContent = String(pill || '');
          wrap.appendChild(span);
        });
        el.appendChild(wrap);
      }
      return el;
    }

    function makeList(parent, rows, emptyText = 'Nothing to show yet.') {
      if (!rows.length) {
        const empty = D.createElement('div');
        empty.setAttribute(ATTR_CGXUI_STATE, 'empty');
        empty.textContent = emptyText;
        parent.appendChild(empty);
        return empty;
      }
      const list = D.createElement('div');
      list.setAttribute(ATTR_CGXUI_STATE, 'list');
      rows.forEach((row) => list.appendChild(makeRow(row)));
      parent.appendChild(list);
      return list;
    }

    function renderChats(body, chats, title = 'Chats') {
      appendSectionTitle(body, title, `${chats.length} shown`);
      const rows = chats.slice(0, CFG_CHAT_PREVIEW_LIMIT).map((chat) => ({
        ...chat,
        icon: '💬',
        subText: [
          chat.folderName ? `Folder: ${chat.folderName}` : '',
          chat.projectName ? `Project: ${chat.projectName}` : '',
          chat.categoryText ? `Category: ${chat.categoryText}` : '',
          chat.updatedAt ? `Updated: ${formatDate(chat.updatedAt)}` : '',
          chat.source ? `Source: ${chat.source}` : '',
        ].filter(Boolean).join(' · '),
        pills: [
          ...(chat.labels || []).slice(0, 3),
          ...(chat.tags || []).slice(0, 2),
        ],
      }));
      makeList(body, rows, 'No chats are available yet.');
    }

    function renderFolders(body, folders) {
      appendSectionTitle(body, 'Folders', `${folders.length} folders`);
      makeList(body, folders.map((folder) => ({
        ...folder,
        icon: '🗂️',
        title: folder.name || folder.id,
        subText: `${folder.chatCount || 0} chats${folder.projectBacked ? ' · project-backed' : ''}`,
      })), 'No folders found.');
    }

    function renderLabels(body, labels) {
      appendSectionTitle(body, 'Labels', `${labels.length} labels`);
      makeList(body, labels.map((label) => ({
        ...label,
        icon: '🏷️',
        title: label.label || label.id,
        subText: `${label.typeLabel || label.type || 'Label'} · ${label.chatCount || 0} chats`,
        pills: label.cardinality ? [label.cardinality] : [],
      })), 'No labels found.');
    }

    function renderCategories(body, categories) {
      appendSectionTitle(body, 'Categories', `${categories.length} categories`);
      makeList(body, categories.map((cat) => ({
        ...cat,
        icon: '#',
        title: cat.name || cat.id,
        subText: `${cat.chatCount || 0} chats`,
      })), 'No categories found.');
    }

    function renderProjects(body, projects) {
      appendSectionTitle(body, 'Projects', `${projects.length} projects`);
      makeList(body, projects.map((project) => ({
        ...project,
        icon: '▣',
        title: project.title || project.name || project.id,
        subText: project.href || project.source || 'Project',
      })), 'No projects found yet.');
    }

    function renderOrganize(body, model, q = '') {
      const organizationBase = Array.isArray(model.savedChats) ? model.savedChats : model.chats;
      const unfiled = filterRows(organizationBase.filter((chat) => !chat.folderId), q).slice(0, 10);
      const needsLabel = filterRows(organizationBase.filter((chat) => !(chat.labels || []).length), q).slice(0, 10);
      const uncategorized = filterRows(organizationBase.filter((chat) => !(chat.categories || []).length), q).slice(0, 10);

      const notices = D.createElement('div');
      notices.setAttribute(ATTR_CGXUI_STATE, 'notice-grid');
      [
        { title: 'Unfiled', count: model.counts.unfiled || 0, note: 'Chats without folder binding' },
        { title: 'Needs label', count: model.counts.needsLabel || 0, note: 'Chats without manual labels' },
        { title: 'Uncategorized', count: model.counts.uncategorized || 0, note: 'Chats without category grouping' },
      ].forEach((item) => {
        const box = D.createElement('div');
        box.setAttribute(ATTR_CGXUI_STATE, 'notice');
        box.innerHTML = `<strong>${escapeHtml(item.count)} ${escapeHtml(item.title)}</strong><div>${escapeHtml(item.note)}</div>`;
        notices.appendChild(box);
      });
      body.appendChild(notices);

      renderChats(body, unfiled, 'Unfiled preview');
      renderChats(body, needsLabel, 'Needs label preview');
      renderChats(body, uncategorized, 'Uncategorized preview');
    }

    function formatDate(value) {
      const raw = String(value || '').trim();
      if (!raw) return '';
      const n = Number(raw);
      const d = Number.isFinite(n) && n > 0 ? new Date(n) : new Date(raw);
      if (Number.isNaN(d.getTime())) return raw.slice(0, 16);
      try { return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }); }
      catch { return raw.slice(0, 16); }
    }

    async function buildLibraryModel(reason = 'workspace-refresh') {
      const indexedModel = await buildLibraryModelFromIndex(reason);
      if (isUsableWorkspaceModel(indexedModel)) {
        return markWorkspaceModelSource(indexedModel, 'library-index');
      }

      const degradedReason = state.lastIndexFailureReason || 'library-index-unavailable';
      return buildLibraryModelFallback(degradedReason);
    }

    async function buildLibraryModelFallback(degradedReason = 'library-index-unavailable') {
      const startedAt = Date.now();
      const archiveRows = safeListArchiveRows();
      const labelsOwner = core.getService?.('labels') || core.getOwner?.('labels') || H2O.Labels || null;
      const foldersApi = core.getService?.('folders') || core.getOwner?.('folders') || H2O.folders || null;
      const categoriesOwner = core.getService?.('categories') || core.getOwner?.('categories') || H2O.Categories || null;
      const projectsOwner = core.getService?.('projects') || core.getOwner?.('projects') || H2O.Projects || null;
      const tagsOwner = core.getService?.('tags') || core.getOwner?.('tags') || H2O.Tags || null;

      const chatsById = new Map();
      const upsertChat = (raw, source = '') => {
        const chat = normalizeChatRow(raw, source);
        if (!chat.chatId && !chat.href) return;
        const key = chat.chatId || chat.href;
        const prev = chatsById.get(key) || {};
        chatsById.set(key, {
          ...prev,
          ...chat,
          title: chat.title || prev.title || key,
          href: chat.href || prev.href || '',
          updatedAt: pickNewestDate(chat.updatedAt, prev.updatedAt),
          source: mergeSource(prev.source, chat.source),
        });
      };

      archiveRows.forEach((row) => upsertChat(row, 'archive'));

      try {
        const labelKnown = labelsOwner?.listKnownChats?.();
        (Array.isArray(labelKnown) ? labelKnown : []).forEach((row) => upsertChat(row, row.source || 'labels'));
      } catch (error) { err('labels-list-known-chats', error); }

      const recentRows = listNativeRecentChats();

      const folders = safeListFolders(foldersApi);
      const folderById = new Map(folders.map((folder) => [String(folder.id || ''), folder]));

      let categoryGroups = [];
      try {
        const maybe = categoriesOwner?.loadGroups?.();
        categoryGroups = Array.isArray(maybe) ? maybe : (await maybe || []);
      } catch (error) { err('categories-load-groups', error); categoryGroups = []; }

      const categoryByChat = new Map();
      (Array.isArray(categoryGroups) ? categoryGroups : []).forEach((group) => {
        const rows = Array.isArray(group?.rows) ? group.rows : [];
        rows.forEach((row) => {
          const chatId = normalizeChatId(row?.chatId || row?.href || row?.url || '');
          const href = String(row?.href || '').trim();
          const key = chatId || href;
          if (!key) return;
          const arr = categoryByChat.get(key) || [];
          if (!arr.some((item) => item.id === group.id)) arr.push({ id: group.id, name: group.name || group.id });
          categoryByChat.set(key, arr);
          upsertChat({ ...row, chatId, href, title: row?.title }, 'categories');
        });
      });

      const projects = await safeListProjects(projectsOwner);
      const labels = safeListLabels(labelsOwner);

      const enrichChat = (chat, extra = {}) => {
        const key = chat.chatId || chat.href;
        const folder = safeGetFolderBinding(foldersApi, chat.chatId || chat.href);
        const folderRecord = folder?.folderId ? folderById.get(String(folder.folderId)) : null;
        const labelSummary = safeGetLabelSummary(labelsOwner, chat.chatId);
        const tagSummary = safeGetTagSummary(tagsOwner, chat.chatId);
        const cats = categoryByChat.get(chat.chatId) || categoryByChat.get(chat.href) || [];
        return {
          ...chat,
          ...extra,
          folderId: String(folder?.folderId || ''),
          folderName: String(folder?.folderName || folderRecord?.name || ''),
          labels: labelSummary.labels,
          labelText: labelSummary.text,
          tags: tagSummary.tags,
          tagText: tagSummary.tags.join(', '),
          categories: cats,
          categoryText: cats.map((item) => item.name).join(', '),
          projectName: inferProjectName(chat, projects),
          key,
        };
      };

      const savedChats = Array.from(chatsById.values())
        .map((chat) => enrichChat(chat, { saved: true }))
        .sort((a, b) => compareDatesDesc(a.updatedAt, b.updatedAt) || String(a.title || '').localeCompare(String(b.title || '')));

      const recentChats = recentRows
        .map((row) => enrichChat(normalizeChatRow(row, 'recents'), { recent: true }))
        .filter((chat) => chat.chatId || chat.href)
        .sort((a, b) => compareDatesDesc(a.updatedAt, b.updatedAt) || String(a.title || '').localeCompare(String(b.title || '')));

      const chats = mergeChatLists(savedChats, recentChats);

      const counts = {
        chats: savedChats.length,
        savedChats: savedChats.length,
        recentChats: recentChats.length,
        allChats: chats.length,
        folders: folders.length,
        labels: labels.length,
        categories: Array.isArray(categoryGroups) ? categoryGroups.length : 0,
        projects: projects.length,
        unfiled: savedChats.filter((chat) => !chat.folderId).length,
        needsLabel: savedChats.filter((chat) => !(chat.labels || []).length).length,
        uncategorized: savedChats.filter((chat) => !(chat.categories || []).length).length,
        needsOrganization: savedChats.filter((chat) => !chat.folderId || !(chat.labels || []).length || !(chat.categories || []).length).length,
        importantOrPinned: savedChats.filter((chat) => {
          const text = String([chat.labelText, ...(Array.isArray(chat.labels) ? chat.labels : []), chat.raw?.priority, chat.raw?.status].filter(Boolean).join(' ')).toLowerCase();
          return chat.pinned === true || chat.isPinned === true || /(^|\b)(important|urgent|pinned|high priority|blocked)(\b|$)/i.test(text);
        }).length,
      };

      return markWorkspaceModelSource({
        ok: true,
        builtAt: Date.now(),
        durationMs: Date.now() - startedAt,
        source: 'workspace-fallback',
        degraded: true,
        degradedReason: String(degradedReason || 'library-index-unavailable'),
        sources: availableSources(),
        counts,
        chats,
        savedChats,
        recentChats,
        folders: folders.map((folder) => ({
          ...folder,
          chatCount: chats.filter((chat) => String(chat.folderId || '') === String(folder.id || '')).length,
          projectBacked: !!folder.projectId || !!folder.nativeProjectId,
        })),
        labels,
        categories: (Array.isArray(categoryGroups) ? categoryGroups : []).map((group) => ({
          id: String(group?.id || ''),
          name: String(group?.name || group?.id || 'Category'),
          color: String(group?.color || ''),
          chatCount: Array.isArray(group?.rows) ? group.rows.length : 0,
          source: 'categories',
        })),
        projects,
      }, 'workspace-fallback', degradedReason);
    }

    function availableSources() {
      return {
        archive: typeof H2O.archiveBoot?.listWorkbenchRows === 'function',
        recents: !!findRecentsSection(),
        folders: !!(core.getService?.('folders') || core.getOwner?.('folders') || H2O.folders),
        projects: !!(core.getService?.('projects') || core.getOwner?.('projects') || H2O.Projects),
        categories: !!(core.getService?.('categories') || core.getOwner?.('categories') || H2O.Categories),
        tags: !!(core.getService?.('tags') || core.getOwner?.('tags') || H2O.Tags),
        labels: !!(core.getService?.('labels') || core.getOwner?.('labels') || H2O.Labels),
        libraryIndex: !!getLibraryIndexApi(),
        libraryInsights: !!getLibraryInsightsApi(),
      };
    }

    function safeListArchiveRows() {
      try {
        const rows = H2O.archiveBoot?.listWorkbenchRows?.();
        return Array.isArray(rows) ? rows : [];
      } catch (error) {
        err('archive-list-workbench-rows', error);
        return [];
      }
    }

    function mergeChatLists(savedChats = [], recentChats = []) {
      const byKey = new Map();
      const put = (chat, sourceKind) => {
        if (!chat || typeof chat !== 'object') return;
        const key = chat.chatId || chat.href;
        if (!key) return;
        const prev = byKey.get(key) || {};
        byKey.set(key, {
          ...prev,
          ...chat,
          saved: !!(prev.saved || chat.saved || sourceKind === 'saved'),
          recent: !!(prev.recent || chat.recent || sourceKind === 'recent'),
          title: chat.title || prev.title || key,
          href: chat.href || prev.href || '',
          updatedAt: pickNewestDate(chat.updatedAt, prev.updatedAt),
          source: mergeSource(prev.source, chat.source),
        });
      };
      (Array.isArray(savedChats) ? savedChats : []).forEach((chat) => put(chat, 'saved'));
      (Array.isArray(recentChats) ? recentChats : []).forEach((chat) => put(chat, 'recent'));
      return Array.from(byKey.values())
        .sort((a, b) => compareDatesDesc(a.updatedAt, b.updatedAt) || String(a.title || '').localeCompare(String(b.title || '')));
    }

    function listNativeRecentChats() {
      const out = [];
      const seen = new Set();
      try {
        const section = findRecentsSection();
        if (!section) return out;
        section.querySelectorAll(SEL.sidebarItemAnchor).forEach((a) => {
          const href = String(a.getAttribute('href') || '').trim();
          const chatId = parseChatIdFromHref(href);
          if (!chatId || seen.has(chatId)) return;
          const title = normText(a.querySelector?.(SEL.sidebarTruncate)?.textContent || a.innerText || a.textContent || chatId).slice(0, 180);
          if (!title || /^more$/i.test(title) || /^recents?$/i.test(title)) return;
          seen.add(chatId);
          out.push({
            chatId,
            href,
            title,
            updatedAt: '',
            source: 'recents',
          });
        });
      } catch (error) { err('native-recents-chats', error); }
      return out;
    }

    function normalizeChatRow(row, source = '') {
      const src = row && typeof row === 'object' ? row : {};
      const href = String(src.href || src.url || src.path || '').trim();
      const chatId = normalizeChatId(src.chatId || src.id || src.conversationId || href);
      return {
        chatId,
        href: href || hrefForChatId(chatId),
        title: normText(src.title || src.name || src.label || src.excerpt || src.summary || chatId || href || 'Untitled chat').slice(0, 200),
        updatedAt: String(src.updatedAt || src.lastActivityAt || src.createdAt || src.savedAt || ''),
        source: String(source || src.source || src.origin || ''),
        archived: src.archived === true || src.isArchived === true,
        pinned: src.pinned === true || src.isPinned === true,
        raw: src,
      };
    }

    function normalizeChatId(raw = '') {
      const value = String(raw || '').trim();
      if (!value) return '';
      const match = value.match(/\/c\/([a-z0-9-]+)/i);
      if (match) return match[1];
      if (/^[a-z0-9-]{8,}$/i.test(value)) return value.replace(/^chat:/, '').trim();
      return value.replace(/^chat:/, '').trim();
    }

    function parseChatIdFromHref(href = '') {
      const match = String(href || '').match(/\/c\/([a-z0-9-]+)/i);
      return match ? match[1] : '';
    }

    function hrefForChatId(chatId = '') {
      const id = normalizeChatId(chatId);
      if (!id || /^imported[-_:]/i.test(id)) return '';
      return `/c/${encodeURIComponent(id)}`;
    }

    function safeListFolders(foldersApi) {
      try {
        const rows = foldersApi?.list?.() || foldersApi?.folders || [];
        return (Array.isArray(rows) ? rows : []).map((row) => ({
          id: String(row?.id || ''),
          name: normText(row?.name || row?.title || row?.id || 'Folder'),
          createdAt: String(row?.createdAt || ''),
          projectId: String(row?.projectId || row?.nativeProjectId || ''),
          source: 'folders',
          raw: row,
        })).filter((row) => row.id || row.name);
      } catch (error) {
        err('folders-list', error);
        return [];
      }
    }

    function safeGetFolderBinding(foldersApi, chatIdOrHref) {
      if (!foldersApi || !chatIdOrHref) return { folderId: '', folderName: '' };
      try {
        const res = foldersApi.getBinding?.(chatIdOrHref) || { folderId: '', folderName: '' };
        return {
          folderId: String(res?.folderId || ''),
          folderName: String(res?.folderName || ''),
        };
      } catch {
        return { folderId: '', folderName: '' };
      }
    }

    async function safeListProjects(projectsOwner) {
      if (!projectsOwner) return [];
      try {
        let rows = [];
        if (typeof projectsOwner.loadRowsFast === 'function') rows = projectsOwner.loadRowsFast(null) || [];
        if (!rows.length && typeof projectsOwner.loadRows === 'function') {
          const maybe = projectsOwner.loadRows(null, { backgroundRefresh: false });
          rows = Array.isArray(maybe) ? maybe : (await maybe || []);
        }
        return (Array.isArray(rows) ? rows : []).map((row) => ({
          id: String(row?.id || row?.projectId || ''),
          title: normText(row?.title || row?.name || row?.id || 'Project'),
          href: String(row?.href || row?.url || ''),
          source: String(row?.source || 'projects'),
          raw: row,
        })).filter((row) => row.title || row.href || row.id);
      } catch (error) {
        err('projects-list', error);
        return [];
      }
    }

    function safeListLabels(labelsOwner) {
      if (!labelsOwner) return [];
      try {
        const typeDefs = typeof labelsOwner.listTypes === 'function' ? labelsOwner.listTypes() : [];
        const typeByKey = new Map((Array.isArray(typeDefs) ? typeDefs : []).map((row) => [row.key, row]));
        const catalog = labelsOwner.listCatalog?.() || {};
        const counts = labelsOwner.getLabelCounts?.() || {};
        const out = [];
        Object.keys(catalog || {}).forEach((type) => {
          const typeDef = typeByKey.get(type) || { key: type, label: type, fullLabel: type, cardinality: '' };
          (Array.isArray(catalog[type]) ? catalog[type] : []).forEach((record) => {
            out.push({
              id: String(record?.id || ''),
              label: normText(record?.label || record?.name || record?.id || 'Label'),
              type,
              typeLabel: String(typeDef.fullLabel || typeDef.label || type),
              cardinality: String(typeDef.cardinality || ''),
              color: String(record?.color || ''),
              chatCount: Number(counts?.[type]?.[record?.id] || 0) || 0,
              source: 'labels',
              raw: record,
            });
          });
        });
        return out;
      } catch (error) {
        err('labels-list', error);
        return [];
      }
    }

    function safeGetLabelSummary(labelsOwner, chatId) {
      if (!labelsOwner || !chatId) return { labels: [], text: '' };
      try {
        const flat = labelsOwner.flattenChatLabels?.(chatId);
        if (Array.isArray(flat)) {
          const labels = flat.map((item) => normText(item?.label || item?.name || item)).filter(Boolean);
          return { labels, text: labels.join(', ') };
        }
      } catch {}
      try {
        const text = normText(labelsOwner.buildLabelSummary?.(chatId) || '');
        return { labels: text ? text.split(/[,·]/).map(normText).filter(Boolean) : [], text };
      } catch {}
      return { labels: [], text: '' };
    }

    function safeGetTagSummary(tagsOwner, chatId) {
      if (!tagsOwner || !chatId) return { tags: [] };
      try {
        const summary = tagsOwner.getChatSummary?.(chatId) || null;
        const tags = Array.isArray(summary?.tags) ? summary.tags.map(normText).filter(Boolean) : [];
        return { tags };
      } catch {
        return { tags: [] };
      }
    }

    function inferProjectName(chat, projects) {
      const href = String(chat.href || '');
      if (!href || !Array.isArray(projects)) return '';
      const match = projects.find((project) => project.href && href.includes(project.href));
      return match?.title || '';
    }

    function mergeSource(a, b) {
      const parts = [];
      String(a || '').split('+').forEach((item) => { const v = normText(item); if (v && !parts.includes(v)) parts.push(v); });
      String(b || '').split('+').forEach((item) => { const v = normText(item); if (v && !parts.includes(v)) parts.push(v); });
      return parts.join('+');
    }

    function pickNewestDate(a, b) {
      if (!a) return b || '';
      if (!b) return a || '';
      return compareDatesDesc(a, b) <= 0 ? a : b;
    }

    function dateMs(value) {
      const raw = String(value || '').trim();
      if (!raw) return 0;
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
      const t = Date.parse(raw);
      return Number.isFinite(t) ? t : 0;
    }

    function compareDatesDesc(a, b) {
      const da = dateMs(a);
      const db = dateMs(b);
      if (da !== db) return db - da;
      return 0;
    }

    function bindRouteEventsOnce() {
      if (state.routeEventsBound) return;
      state.routeEventsBound = true;
      const sync = (reason) => {
        W.setTimeout(() => {
          try {
            const route = parseLibraryRoute(W.location.href);
            if (route) {
              owner.openWorkspace({ fromRoute: true, baseHref: route.baseHref, reason }).catch((error) => err(`route-open:${reason}`, error));
            } else if (state.pageEl?.isConnected) {
              closeWorkspace({ skipHistory: true, reason: `route-exit:${reason}` });
            }
            syncSidebarActiveState();
            scheduleLibraryActiveSyncPair(`route:${reason}`);
          } catch (error) {
            err(`route-sync:${reason}`, error);
          }
        }, 0);
      };
      const onPopState = () => sync('popstate');
      const onHashChange = () => sync('hashchange');
      W.addEventListener('popstate', onPopState, true);
      W.addEventListener('hashchange', onHashChange, true);
      state.clean.listeners.add(() => W.removeEventListener('popstate', onPopState, true));
      state.clean.listeners.add(() => W.removeEventListener('hashchange', onHashChange, true));
    }

    function bindPageExitEventsOnce() {
      if (state.pageExitEventsBound) return;
      state.pageExitEventsBound = true;

      const clearActiveSoon = () => {
        state.pageRoute = parseLibraryRoute(W.location.href);
        if (!state.pageRoute) {
          state.pageEl = state.pageEl?.isConnected ? state.pageEl : null;
          state.pageHost = null;
        }
        syncSidebarActiveState();
        scheduleLibraryActiveSyncPair('page-exit');
      };

      const onCorePageExited = () => {
        W.setTimeout(clearActiveSoon, 0);
        W.setTimeout(clearActiveSoon, 120);
      };

      const onNativeClick = (event) => {
        if (!parseLibraryRoute(W.location.href)) return;
        if (event.defaultPrevented) return;
        if (event.button && event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target?.closest?.('a[href]');
        if (!(link instanceof HTMLAnchorElement)) return;
        let url = null;
        try { url = new URL(link.href, W.location.href); } catch { return; }
        if (url.origin !== W.location.origin) return;
        if (parseLibraryRoute(url.href)) return;
        state.pageRoute = null;
        syncSidebarActiveState();
        W.setTimeout(clearActiveSoon, 0);
        W.setTimeout(clearActiveSoon, 90);
        W.setTimeout(clearActiveSoon, 180);
      };

      W.addEventListener('evt:h2o:library-core:page-exited', onCorePageExited, true);
      D.addEventListener('click', onNativeClick, true);
      state.clean.listeners.add(() => W.removeEventListener('evt:h2o:library-core:page-exited', onCorePageExited, true));
      state.clean.listeners.add(() => D.removeEventListener('click', onNativeClick, true));
    }

    function selfCheck() {
      const model = state.model;
      const index = getLibraryIndexApi();
      const sources = availableSources();
      const roots = D.querySelectorAll(utilSelScoped(UI_LIBRARY_ROOT));
      const topRows = D.querySelectorAll(topLibraryButtonSelector());
      const railRows = D.querySelectorAll(railLibraryButtonSelector());
      const topPlacement = getTopLibraryButtonPlacementInfo();
      const railPlacement = getRailLibraryButtonPlacementInfo();
      const libraryRouteActive = isLibraryRouteActive();
      const lowerRow = roots[0]?.querySelector?.(utilSelScoped(UI_LIBRARY_ROW)) || null;
      const topLibraryButtonActive = [...topRows].some((row) => hasActiveMarkers(row) || hasActiveMarkers(row.querySelector?.('[data-sidebar-item="true"]')));
      const railLibraryButtonActive = [...railRows].some((row) => hasActiveMarkers(row) || hasActiveMarkers(railButtonWrapFor(row)));
      const lowerLibraryRowActive = hasActiveMarkers(roots[0]) || hasActiveMarkers(lowerRow);
      const nativeActiveRowsCount = libraryRouteActive ? nativeSidebarActiveRows().length : 0;
      return {
        ok: !!core.getOwner?.('library-workspace') && !!core.getService?.('library-workspace') && !!core.getRoute?.('library'),
        hasCore: !!core,
        hasIndex: !!index,
        hasInsights: !!getLibraryInsightsApi(),
        hasLibraryIndex: !!index,
        libraryIndexAvailable: !!index,
        indexModelFresh: isLibraryIndexFresh(index),
        libraryInsightsAvailable: !!getLibraryInsightsApi(),
        indexUpdateListenerBound: !!state.indexUpdateListenerBound,
        lastModelSource: state.lastModelSource || model?.source || '',
        lastDegradedReason: state.lastDegradedReason || model?.degradedReason || '',
        lastIndexFailureReason: state.lastIndexFailureReason || '',
        modelSource: model?.source || model?.sourceModel || '',
        degraded: !!model?.degraded,
        degradedReason: String(model?.degradedReason || ''),
        registeredOwner: !!core.getOwner?.('library-workspace'),
        registeredService: !!core.getService?.('library-workspace'),
        registeredRoute: !!core.getRoute?.('library'),
        registeredPage: !!core.getPage?.('library'),
        libraryRouteActive,
        topLibraryButtonActive,
        railLibraryButtonActive,
        lowerLibraryRowActive,
        nativeActiveRowsWhileLibraryActive: nativeActiveRowsCount,
        lastLibraryActiveSyncReason: String(state.lastLibraryActiveSyncReason || ''),
        libraryActiveSyncCount: Number(state.libraryActiveSyncCount || 0),
        lastLibraryActiveSyncAt: Number(state.lastLibraryActiveSyncAt || 0),
        sidebarRowExists: roots.length === 1,
        sidebarRowCount: roots.length,
        topLibraryButtonExists: topRows.length === 1,
        topLibraryButtonCount: topRows.length,
        topLibraryButtonParentInfo: topPlacement,
        topLibraryButtonBeforeNewChat: !!topPlacement.beforeNewChat,
        topLibraryButtonAfterNewChat: !!topPlacement.afterNewChat,
        topLibraryButtonAdjacentToNewChat: !!topPlacement.adjacentToNewChat,
        topLibraryButtonRailMode: String(state.topLibraryButtonRailMode || ''),
        topLibraryButtonRailWidth: Number(state.topLibraryButtonRailWidth || 0),
        topLibraryButtonInsertAttempted: !!state.topLibraryButtonInsertAttempted,
        topLibraryButtonInsertFailedReason: String(state.topLibraryButtonInsertFailedReason || ''),
        railLibraryButtonExists: railRows.length === 1,
        railLibraryButtonCount: railRows.length,
        railLibraryButtonParentInfo: railPlacement,
        railLibraryButtonBeforeNewChat: !!railPlacement.beforeNewChat,
        railLibraryButtonInsertAttempted: !!state.railLibraryButtonInsertAttempted,
        railLibraryButtonInsertFailedReason: String(state.railLibraryButtonInsertFailedReason || ''),
        firstSidebarShellAt: Number(state.firstSidebarShellAt || 0),
        firstTopLibraryButtonAt: Number(state.firstTopLibraryButtonAt || 0),
        firstFoldersShellAt: Number(state.firstFoldersShellAt || 0),
        firstLabelsShellAt: Number(state.firstLabelsShellAt || 0),
        firstCategoriesShellAt: Number(state.firstCategoriesShellAt || 0),
        sidebarShellRenderCount: Number(state.sidebarShellRenderCount || 0),
        sidebarHydrationCount: Number(state.sidebarHydrationCount || 0),
        sidebarHydrationLastReason: String(state.sidebarHydrationLastReason || ''),
        sidebarShellSkippedDuplicateCount: Number(state.sidebarShellSkippedDuplicateCount || 0),
        sidebarShellMode: String(state.sidebarShellMode || ''),
        sidebarPrepaintStable: !!state.sidebarPrepaintStable,
        sidebarPrepaintHydrated: prepaintHydrationReady(),
        sidebarPrepaintRoots: {
          folders: !!findPrepaintOwnedRoot('folders'),
          labels: !!findPrepaintOwnedRoot('labels'),
          categories: !!findPrepaintOwnedRoot('categories'),
        },
        contaminatedTopButtonMarkersCount: countContaminatedTopButtonMarkers(),
        cleanedContaminatedTopButtonMarkersCount: Number(state.cleanedContaminatedTopButtonMarkersCount || 0),
        lastTopButtonEnsureReason: String(state.lastTopButtonEnsureReason || state.topLibraryButtonLastReason || ''),
        lastRailButtonEnsureReason: String(state.lastRailButtonEnsureReason || state.railLibraryButtonLastReason || ''),
        sidebarRenderCount: Number(state.sidebarRenderCount || 0),
        sidebarEnsureCount: Number(state.sidebarEnsureCount || 0),
        sidebarActiveSyncCount: Number(state.sidebarActiveSyncCount || 0),
        sidebarSkippedH2OMutations: Number(state.sidebarSkippedH2OMutations || 0),
        sidebarLastRenderReason: String(state.sidebarLastRenderReason || state.lastSidebarRenderReason || ''),
        sidebarLastEnsureReason: String(state.sidebarLastEnsureReason || state.lastSidebarEnsureReason || ''),
        sidebarLastActiveSyncReason: String(state.sidebarLastActiveSyncReason || state.lastSidebarActiveSyncReason || ''),
        sidebarLastRenderAt: Number(state.sidebarLastRenderAt || 0),
        sidebarLastEnsureAt: Number(state.sidebarLastEnsureAt || 0),
        sidebarLastActiveSyncAt: Number(state.sidebarLastActiveSyncAt || 0),
        topLibraryButtonRenderCount: Number(state.topLibraryButtonRenderCount || 0),
        topLibraryButtonActiveSyncCount: Number(state.topLibraryButtonActiveSyncCount || 0),
        topLibraryButtonSkippedH2OMutations: Number(state.topLibraryButtonSkippedH2OMutations || 0),
        topLibraryButtonLastReason: String(state.topLibraryButtonLastReason || ''),
        railLibraryButtonRenderCount: Number(state.railLibraryButtonRenderCount || 0),
        railLibraryButtonActiveSyncCount: Number(state.railLibraryButtonActiveSyncCount || 0),
        railLibraryButtonLastReason: String(state.railLibraryButtonLastReason || ''),
        lastSidebarRenderReason: String(state.lastSidebarRenderReason || ''),
        lastSidebarActiveSyncReason: String(state.lastSidebarActiveSyncReason || ''),
        pageMounted: !!state.pageEl?.isConnected,
        availableSources: sources,
        counts: model?.counts || null,
        routePatch: !!getRouteService()?.__h2oLibraryWorkspaceRoutePatchV1,
        sidebarLayout: getSidebarLayoutDiagnostics(),
        route: parseLibraryRoute(W.location.href),
        bootDiag: H2O.LibraryWorkspaceBootDiag || null,
        diag: {
          steps: diag.steps.slice(-14),
          errors: diag.errors.slice(-10),
        },
      };
    }

    const owner = {
      phase: 'phase-7-index-first-workspace-model',
      openWorkspace(opts = {}) { return openWorkspace(opts); },
      closeWorkspace(opts = {}) { return closeWorkspace(opts); },
      refresh(reason = 'api') { return loadAndRender(reason); },
      buildModel(reason = 'api') { return buildLibraryModel(reason); },
      getModel() { return state.model; },
      ensureInjected(reason = 'api') { return ensureInjected(reason); },
      ensureSidebarPrepaint(reason = 'api') { return ensureSidebarPrepaint(reason); },
      ensureTopLibraryButton(reason = 'api') { return ensureTopLibraryButton(reason); },
      ensureRailLibraryButton(reason = 'api') { return ensureRailLibraryButton(reason); },
      syncLibrarySidebarActiveState(reason = 'api') { return syncLibrarySidebarActiveState(reason); },
      syncTopLibraryButtonActiveState(reason = 'api') { return syncTopLibraryButtonActiveState(reason); },
      syncRailLibraryButtonActiveState(reason = 'api') { return syncRailLibraryButtonActiveState(reason); },
      getSidebarLayout() { return getSidebarLayout(); },
      setSidebarSectionVisible(sectionId, visible) { return setSidebarSectionVisible(sectionId, visible); },
      moveSidebarSection(sectionId, direction) { return moveSidebarSection(sectionId, direction); },
      setSidebarOrder(sectionIds) { return setSidebarOrder(sectionIds); },
      resetSidebarLayout() { return resetSidebarLayout(); },
      applySidebarLayout(reason = 'api') { return applySidebarLayout(reason); },
      getSidebarLayoutDiagnostics() { return getSidebarLayoutDiagnostics(); },
      resetWorkspaceUiPrefs() { return resetWorkspaceUiPrefs(); },
      selfCheck() { return selfCheck(); },
    };

    function registerWithCore() {
      try {
        core.registerOwner?.('library-workspace', owner, { replace: true });
        core.registerService?.('library-workspace', owner, { replace: true });
        core.registerPage?.('library', owner, { replace: true });
        core.registerRoute?.('library', async (route) => {
          const page = await owner.openWorkspace({ fromRoute: true, baseHref: route?.baseHref, reason: 'core-route' });
          return !!page;
        }, { replace: true });
        step('library-workspace-registered');
      } catch (error) {
        err('register-with-core', error);
      }
    }

    function boot() {
      const wasBooted = !!state.booted;
      state.booted = true;
      ensureStyle();
      const bootReason = wasBooted ? 'reboot' : 'boot';
      cleanupContaminatedTopButtonMarkers(bootReason);
      registerWithCore();
      extendRouteServiceForLibrary();
      bindRouteEventsOnce();
      bindPageExitEventsOnce();
      bindLibraryIndexEventsOnce();
      ensureSidebarPrepaint(`${bootReason}-sync`);
      scheduleSidebarPrepaint(bootReason);
      ensureSidebarPrepaintObserver(bootReason);
      scheduleEnsure(bootReason);
      scheduleSidebarLayoutApply(bootReason);
      scheduleTopLibraryButtonRetries(bootReason);

      const immediate = W.setTimeout(() => {
        state.clean.timers.delete(immediate);
        ensureInjected(`${bootReason}-immediate`);
      }, 0);
      state.clean.timers.add(immediate);

      const late = W.setTimeout(() => {
        state.clean.timers.delete(late);
        ensureInjected(`late-${bootReason}`);
      }, 900);
      state.clean.timers.add(late);

      W.setTimeout(() => {
        const route = parseLibraryRoute(W.location.href);
        if (route) owner.openWorkspace({ fromRoute: true, baseHref: route.baseHref, reason: 'boot-route' }).catch((error) => err('boot-route', error));
      }, 0);

      Object.keys(owner).forEach((key) => {
        if (typeof owner[key] === 'function') MOD[key] = (...args) => owner[key](...args);
      });
      MOD.owner = owner;
      MOD.storage = MOD.storage || { readUi, writeUi, getSidebarLayout, writeSidebarLayout };
      MOD.ui = MOD.ui || { ensureStyle, ensureInjected, applySidebarLayout };
      MOD.ui.ensureSidebarPrepaint = ensureSidebarPrepaint;
      MOD.ui.ensureTopLibraryButton = ensureTopLibraryButton;
      MOD.ui.ensureRailLibraryButton = ensureRailLibraryButton;
      MOD.ui.syncTopLibraryButtonActiveState = syncTopLibraryButtonActiveState;
      MOD.ui.syncRailLibraryButtonActiveState = syncRailLibraryButtonActiveState;
      MOD.selfCheck = (...args) => owner.selfCheck(...args);
      step('boot');
    }

    boot();
  }

  bootWhenLibraryCoreReady();
})();
