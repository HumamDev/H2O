// ==H2O Module==
// @h2o-id             9b1a.tab.title
// @name               9B1a.🟤🔖 Tab Title 🔖
// @namespace          H2O.Premium.CGX.tab.title
// @author             HumamDev
// @version            2.0.0
// @revision           001
// @build              260506-000000
// @description        Browser tab title renderer for H2O.ChatTitle canonical state.
// @match              https://chatgpt.com/*
// @run-at             document-start
// @grant              none
// ==/H2O Module==

(function () {
  'use strict';

  const W = window;
  const D = document;
  const BOOT_KEY = '__h2oTabTitleRuntime_v2';
  try { W[BOOT_KEY]?.destroy?.(); } catch {}
  const TITLE_WRITE_TTL_MS = 900;
  const PAGE_TITLE_SYNC_MS = 300;
  const H2O_QUERY_FLAG = 'h2o_flsc';
  const H2O_QUERY_VIEW = 'h2o_flsc_view';
  const H2O_QUERY_ID = 'h2o_flsc_id';
  const PRODUCT_TITLE = 'Cockpit Pro';
  const LIBRARY_TITLE = 'Library';
  const TITLE_JOINER = ' — ';
  const H2O_PAGE_SELECTOR = [
    '[data-cgxui-page-title][data-cgxui-owner]',
    '[data-cgxui$="-page-host"][data-cgxui-owner]',
    '[data-cgxui$="-page"][data-cgxui-owner]',
  ].join(', ');
  const LIBRARY_TAB_LABELS = Object.freeze({
    dashboard: 'Dashboard',
    analytics: 'Analytics',
    explorer: 'Explorer',
    recents: 'Recents',
    saved: 'Saved',
    recent: 'Recents',
    organize: 'Organize',
    folders: 'Folders',
    labels: 'Labels',
    categories: 'Categories',
    projects: 'Projects',
  });
  const URL_VIEW_LABELS = Object.freeze({
    library: 'Library',
    dashboard: 'Dashboard',
    analytics: 'Analytics',
    explorer: 'Explorer',
    recents: 'Recents',
    saved: 'Saved',
    recent: 'Recents',
    organize: 'Organize',
    categories: 'Categories',
    tags: 'Tags',
    folders: 'Folders',
    labels: 'Labels',
    projects: 'Projects',
  });
  const DETAIL_VIEWS = Object.freeze(['category', 'tag', 'tags-usage', 'folder', 'label', 'project']);
  let lastRendered = '';
  let pageTitleOverride = '';
  let unsubscribe = null;
  let attachTimer = 0;
  let pageTitleSyncTimer = 0;
  let pageTitleSyncFrame = 0;
  let pageTitleObserver = null;
  let lastWriteAt = 0;
  let lastWriteTitle = '';
  let lastWriteReason = '';
  let lastNativeOverwrite = null;
  let locationWatchInstalled = false;
  let historyRestore = null;
  let lastCanonicalChatState = null;
  let lastCanonicalRouteToken = -1;
  let destroyed = false;
  let publicApi = null;
  const cleanups = new Set();

  function addCleanup(fn) {
    if (typeof fn === 'function') cleanups.add(fn);
    return fn;
  }

  function listen(target, eventName, handler, options) {
    try {
      target?.addEventListener?.(eventName, handler, options);
      addCleanup(() => target?.removeEventListener?.(eventName, handler, options));
      return true;
    } catch {
      return false;
    }
  }

  function norm(value) {
    return String(value || '').replace(/[\s\u00A0]+/g, ' ').trim();
  }

  function stripTrailingChatGPT(raw) {
    return norm(raw).replace(/\s*[–—-]\s*ChatGPT\s*$/i, '').trim();
  }

  function fallbackTitle() {
    const raw = stripTrailingChatGPT(D.title || '');
    if (!raw || /^chatgpt$/i.test(raw)) return '';
    const parts = raw.split(/\s*[–—-]\s*/g).map(norm).filter(Boolean);
    const filtered = parts.filter((part) => !/^chatgpt$/i.test(part));
    return filtered[filtered.length - 1] || raw;
  }

  function renderTitle(nextTitle, reason = 'render', options) {
    const canonical = options?.canonical === true;
    const title = canonical
      ? (typeof nextTitle === 'string' ? nextTitle : '')
      : norm(nextTitle);
    if (!title || (!canonical && /^chatgpt$/i.test(title))) return;
    if (title === lastRendered && document.title === title) return;

    lastRendered = title;
    try {
      W.H2O?.ChatTitle?.markDocumentTitleWrite?.(title, {
        source: 'tab-title',
        ttlMs: TITLE_WRITE_TTL_MS,
      });
    } catch {}
    if (document.title !== title) {
      document.title = title;
      lastWriteAt = Date.now();
      lastWriteTitle = title;
      lastWriteReason = String(reason || 'render');
    }
  }

  function renderFromState(state) {
    const activePageTitle = readActiveH2OPageTitle();
    if (activePageTitle || pageTitleOverride) {
      pageTitleOverride = activePageTitle || pageTitleOverride;
      renderTitle(pageTitleOverride);
      return;
    }
    if (state?.convergence?.enabled === true && state?.routeKind === 'chat') {
      const token = Number(state.routeToken);
      if (Number.isSafeInteger(token) && token < lastCanonicalRouteToken) return;
      if (Number.isSafeInteger(token)) lastCanonicalRouteToken = token;
      lastCanonicalChatState = {
        chatId: state.chatId || null,
        routeToken: Number.isSafeInteger(token) ? token : lastCanonicalRouteToken,
        documentTitle: state.documentTitle || '',
        displayTitle: state.displayTitle || '',
        convergence: { ...state.convergence },
      };
      const canonicalTitle = state.documentTitle || state.displayTitle || '';
      if (canonicalTitle) renderTitle(canonicalTitle, 'canonical-chat-state', { canonical: true });
      return;
    }
    lastCanonicalChatState = null;
    const nextTitle = state?.documentTitle || state?.displayTitle || state?.baseTitle || '';
    if (nextTitle) renderTitle(nextTitle);
  }

  function isVisibleNode(el) {
    if (!(el instanceof HTMLElement) || !el.isConnected) return false;
    try {
      if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
    } catch {}
    try {
      const style = W.getComputedStyle?.(el);
      if (style && (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0)) return false;
    } catch {}
    try {
      const rect = el.getBoundingClientRect?.();
      if (rect && rect.width <= 0 && rect.height <= 0) return false;
    } catch {}
    return true;
  }

  function pageTitleFromNode(el) {
    if (!(el instanceof HTMLElement)) return '';
    const explicit = norm(el.getAttribute('data-cgxui-page-title') || '');
    if (explicit && !/^chatgpt$/i.test(explicit)) return explicit;
    let heading = null;
    try {
      heading = el.querySelector('h1, [data-cgxui-page-title-text], [data-cgxui$="page-title"]');
    } catch {}
    const title = norm(heading?.textContent || '');
    return title && !/^chatgpt$/i.test(title) ? title : '';
  }

  function titleSegments(...segments) {
    const out = [];
    segments.flat().forEach((segment) => {
      const item = norm(segment);
      if (!item || /^chatgpt$/i.test(item)) return;
      if (out[out.length - 1] === item) return;
      out.push(item);
    });
    return out;
  }

  function composeTitle(...segments) {
    return titleSegments(...segments, PRODUCT_TITLE).join(TITLE_JOINER);
  }

  function hashTagTitle(raw) {
    const title = norm(raw).replace(/^#+\s*/, '');
    return title ? `#${title}` : '#Tag';
  }

  function readSelectedLibraryTab(el) {
    if (!(el instanceof HTMLElement)) return null;
    let btn = null;
    try {
      btn = el.querySelector('[data-h2o-library-tab][aria-selected="true"]');
    } catch {}
    if (!(btn instanceof HTMLElement)) return null;
    const key = norm(btn.getAttribute('data-h2o-library-tab') || '').toLowerCase();
    const label = norm(btn.textContent || LIBRARY_TAB_LABELS[key] || key);
    return key ? { key, label: label || LIBRARY_TAB_LABELS[key] || key } : null;
  }

  function readSelectedCategoriesSection(el) {
    if (!(el instanceof HTMLElement)) return 'categories';
    let tagBtn = null;
    try {
      tagBtn = el.querySelector('[data-h2o-tags-tab="1"][aria-selected="true"], [data-h2o-tags-tab="1"][data-cgxui-state="tab"]');
    } catch {}
    return tagBtn instanceof HTMLElement ? 'tags' : 'categories';
  }

  function readH2ORouteFromUrl(input = W.location.href) {
    let url = null;
    try {
      url = input instanceof URL ? input : new URL(String(input || W.location.href), W.location.href);
    } catch {
      return null;
    }
    const flag = norm(url.searchParams.get(H2O_QUERY_FLAG) || '');
    const viewRaw = norm(url.searchParams.get(H2O_QUERY_VIEW) || '').toLowerCase();
    const id = norm(url.searchParams.get(H2O_QUERY_ID) || '');
    const active = flag === '1' || !!viewRaw;
    if (!active) return null;

    const view = viewRaw || 'library';
    const label = URL_VIEW_LABELS[view] || view.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const kind = ['dashboard', 'analytics', 'explorer', 'recents', 'saved', 'recent', 'organize'].includes(view)
      ? 'library-section'
      : view;
    return {
      source: 'url',
      kind,
      view,
      id,
      title: label,
      owner: '',
      node: null,
      url: url.href,
      flag,
      h2o_flsc: flag,
      h2o_flsc_view: viewRaw,
      h2o_flsc_id: id,
    };
  }

  function isNativeChatUrl(input = W.location.href) {
    let url = null;
    try {
      url = input instanceof URL ? input : new URL(String(input || W.location.href), W.location.href);
    } catch {
      return false;
    }
    if (!/^https?:$/i.test(url.protocol)) return false;
    if (url.origin !== W.location.origin) return false;
    if (url.searchParams.get(H2O_QUERY_FLAG) === '1') return false;
    return /^\/c\/[^/]+\/?$/i.test(url.pathname);
  }

  function readActiveH2ODomPage() {
    let candidates = [];
    try {
      candidates = [...D.querySelectorAll(H2O_PAGE_SELECTOR)];
    } catch {}
    const visible = candidates.filter(isVisibleNode);
    for (const el of visible) {
      const title = pageTitleFromNode(el);
      if (!title) continue;
      const kind = norm(el.getAttribute('data-cgxui-page-kind') || '');
      const id = norm(el.getAttribute('data-cgxui-page-id') || '');
      const owner = norm(el.getAttribute('data-cgxui-owner') || '');
      return { source: 'dom', node: el, kind, view: kind, id, title, owner };
    }
    return null;
  }

  function isDetailKind(kind = '') {
    return DETAIL_VIEWS.includes(norm(kind).toLowerCase());
  }

  function readActiveH2OPage() {
    const urlPage = readH2ORouteFromUrl();
    if (!urlPage && isNativeChatUrl()) return null;

    const domPage = readActiveH2ODomPage();

    if (!urlPage) return domPage;
    if (!domPage) return urlPage;

    const domKind = norm(domPage.kind || '').toLowerCase();
    const urlKind = norm(urlPage.kind || '').toLowerCase();
    const urlView = norm(urlPage.view || '').toLowerCase();
    const sameSurface = domKind === urlKind || (domKind === 'library' && urlKind === 'library-section');
    const detailDomMatchesUrl = isDetailKind(domKind) && (domKind === urlView || (domKind === 'tags-usage' && urlView === 'tag'));

    if (sameSurface || detailDomMatchesUrl) {
      return {
        ...domPage,
        route: urlPage,
        url: urlPage.url,
        h2o_flsc: urlPage.h2o_flsc,
        h2o_flsc_view: urlPage.h2o_flsc_view,
        h2o_flsc_id: urlPage.h2o_flsc_id,
      };
    }
    return {
      ...urlPage,
      domPage,
    };
  }

  function computeH2OPageTitle(pageRaw = null) {
    const page = pageRaw || readActiveH2OPage();
    if (!page) return '';

    const node = page.node instanceof HTMLElement ? page.node : null;
    const kind = norm(page.kind || '').toLowerCase();
    const view = norm(page.view || '').toLowerCase();
    const title = norm(page.title || '');
    const selectedLibraryTab = readSelectedLibraryTab(node);
    const selectedCategoriesSection = readSelectedCategoriesSection(node);

    switch (kind) {
      case 'library': {
        if (selectedLibraryTab && selectedLibraryTab.key !== 'dashboard') {
          return composeTitle(selectedLibraryTab.label, LIBRARY_TITLE);
        }
        return composeTitle(LIBRARY_TITLE);
      }
      case 'library-section': {
        if (!view || view === 'library' || view === 'dashboard') return composeTitle(LIBRARY_TITLE);
        return composeTitle(URL_VIEW_LABELS[view] || title || view, LIBRARY_TITLE);
      }
      case 'categories':
        if (selectedCategoriesSection === 'tags') return composeTitle('Tags', LIBRARY_TITLE);
        return composeTitle('Categories', LIBRARY_TITLE);
      case 'category':
        return composeTitle(title || 'Category', 'Categories');
      case 'tags':
        return composeTitle('Tags', LIBRARY_TITLE);
      case 'tag':
        return composeTitle(hashTagTitle(title || page.id || 'Tag'), 'Tags');
      case 'tags-usage':
        return composeTitle(hashTagTitle(title), 'Tags');
      case 'folders':
        return composeTitle('Folders', LIBRARY_TITLE);
      case 'folder':
        return composeTitle(title || 'Folder', 'Folders');
      case 'labels':
        return composeTitle('Labels', LIBRARY_TITLE);
      case 'label':
        return composeTitle(title || 'Label', 'Labels');
      case 'projects':
        return composeTitle('Projects', LIBRARY_TITLE);
      case 'project':
        return composeTitle(title || 'Project', 'Projects');
      default:
        if (view && URL_VIEW_LABELS[view]) return composeTitle(URL_VIEW_LABELS[view], LIBRARY_TITLE);
        return title ? composeTitle(title, LIBRARY_TITLE) : '';
    }
  }

  function readActiveH2OPageTitle() {
    return computeH2OPageTitle(readActiveH2OPage());
  }

  function readActiveLibraryPageTitle() {
    return readActiveH2OPageTitle();
  }

  function inspectTitleState() {
    const page = readActiveH2OPage();
    const route = readH2ORouteFromUrl();
    const computedTitle = computeH2OPageTitle(page);
    const activePage = page ? {
      source: page.source || '',
      kind: page.kind || '',
      view: page.view || page.kind || '',
      id: page.id || '',
      title: page.title || '',
      owner: page.owner || '',
      libraryTab: readSelectedLibraryTab(page.node),
      categoriesSection: readSelectedCategoriesSection(page.node),
    } : null;
    return {
      currentUrl: String(W.location.href || ''),
      h2o_flsc: route?.h2o_flsc || '',
      h2o_flsc_view: route?.h2o_flsc_view || '',
      h2o_flsc_id: route?.h2o_flsc_id || '',
      detectedSource: page?.source || 'none',
      activePage,
      activeView: activePage?.view || '',
      computedTitle,
      documentTitle: String(D.title || ''),
      h2oTitleOwnershipActive: !!computedTitle,
      overrideActive: !!pageTitleOverride,
      lastRendered,
      lastWriteAt,
      lastWriteTitle,
      lastWriteReason,
      lastNativeOverwriteDetected: lastNativeOverwrite,
    };
  }

  function setPageTitleOverride(title, reason = 'library-page') {
    const next = norm(title);
    if (!next || /^chatgpt$/i.test(next)) return false;
    pageTitleOverride = next;
    renderTitle(next, reason);
    schedulePageTitleSync(reason);
    return true;
  }

  function clearPageTitleOverride() {
    pageTitleOverride = readActiveH2OPageTitle();
    if (pageTitleOverride) {
      renderTitle(pageTitleOverride, 'clear-page-title-still-active');
      return;
    }
    try {
      const api = W.H2O && W.H2O.ChatTitle;
      if (api && typeof api.refresh === 'function') api.refresh('library-page-exited');
      if (api && typeof api.getState === 'function') renderFromState(api.getState());
    } catch {}
  }

  function syncPageTitleOverride(reason = 'page-title-sync') {
    if (destroyed) return false;
    const activePageTitle = readActiveH2OPageTitle();
    if (activePageTitle) {
      const currentTitle = norm(D.title || '');
      if (currentTitle && currentTitle !== activePageTitle) {
        lastNativeOverwrite = {
          at: Date.now(),
          reason: String(reason || ''),
          currentTitle,
          expectedTitle: activePageTitle,
        };
      }
      pageTitleOverride = activePageTitle;
      renderTitle(activePageTitle, reason);
      return true;
    }

    if (lastCanonicalChatState?.convergence?.enabled === true) {
      const canonicalTitle = lastCanonicalChatState.documentTitle || lastCanonicalChatState.displayTitle || '';
      if (canonicalTitle) {
        const currentTitle = typeof D.title === 'string' ? D.title : '';
        if (currentTitle && currentTitle !== canonicalTitle) {
          lastNativeOverwrite = {
            at: Date.now(),
            reason: String(reason || ''),
            currentTitle,
            expectedTitle: canonicalTitle,
          };
        }
        pageTitleOverride = '';
        renderTitle(canonicalTitle, reason, { canonical: true });
        return true;
      }
    }

    if (!pageTitleOverride) return false;
    pageTitleOverride = '';
    try {
      const api = W.H2O && W.H2O.ChatTitle;
      if (api && typeof api.refresh === 'function') api.refresh(reason);
      if (api && typeof api.getState === 'function') renderFromState(api.getState());
    } catch {}
    return false;
  }

  function schedulePageTitleSync(reason = 'page-title-scheduled') {
    if (destroyed || pageTitleSyncFrame) return;
    const run = () => {
      pageTitleSyncFrame = 0;
      syncPageTitleOverride(reason);
    };
    try {
      if (typeof W.requestAnimationFrame === 'function') {
        pageTitleSyncFrame = W.requestAnimationFrame(run);
        return;
      }
    } catch {}
    pageTitleSyncFrame = W.setTimeout(run, 0);
  }

  function installPageTitleWatch() {
    if (destroyed) return;
    if (!pageTitleSyncTimer) {
      pageTitleSyncTimer = W.setInterval(() => syncPageTitleOverride('page-title-interval'), PAGE_TITLE_SYNC_MS);
    }

    if (!pageTitleObserver && D.documentElement && typeof W.MutationObserver === 'function') {
      pageTitleObserver = new MutationObserver(() => schedulePageTitleSync('page-title-dom-mutation'));
      try {
        pageTitleObserver.observe(D.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
          attributeFilter: [
            'aria-hidden',
            'aria-selected',
            'class',
            'data-cgxui',
            'data-cgxui-owner',
            'data-cgxui-page-kind',
            'data-cgxui-page-id',
            'data-cgxui-page-title',
            'data-h2o-library-tab',
            'data-h2o-tags-tab',
            'hidden',
            'style',
          ],
        });
      } catch {
        pageTitleObserver = null;
      }
    }
  }

  function installLocationWatch() {
    if (destroyed || locationWatchInstalled) return;
    locationWatchInstalled = true;

    try {
      if (!W.history.__h2oTabTitlePatchedV1) {
        const bases = {
          pushState: W.history.pushState,
          replaceState: W.history.replaceState,
        };
        const wrappers = {};
        ['pushState', 'replaceState'].forEach((name) => {
          const base = bases[name];
          if (typeof base !== 'function') return;
          wrappers[name] = function (...args) {
            const result = base.apply(this, args);
            schedulePageTitleSync(`history:${name}`);
            return result;
          };
          W.history[name] = wrappers[name];
        });
        try { Object.defineProperty(W.history, '__h2oTabTitlePatchedV1', { value: true, configurable: true }); } catch { W.history.__h2oTabTitlePatchedV1 = true; }
        historyRestore = () => {
          ['pushState', 'replaceState'].forEach((name) => {
            if (wrappers[name] && W.history[name] === wrappers[name]) W.history[name] = bases[name];
          });
          try { delete W.history.__h2oTabTitlePatchedV1; } catch {}
        };
      }
    } catch {}

    const onPopState = () => schedulePageTitleSync('popstate');
    const onHashChange = () => schedulePageTitleSync('hashchange');
    const onFocus = () => schedulePageTitleSync('window-focus');
    const onVisibilityChange = () => schedulePageTitleSync('visibilitychange');
    listen(W, 'popstate', onPopState, true);
    listen(W, 'hashchange', onHashChange, true);
    listen(W, 'focus', onFocus, true);
    listen(D, 'visibilitychange', onVisibilityChange, true);
  }

  function attach() {
    if (destroyed) return false;
    const api = W.H2O && W.H2O.ChatTitle;
    if (!api || typeof api.subscribe !== 'function') return false;
    if (unsubscribe) return true;

    unsubscribe = api.subscribe((state) => renderFromState(state));
    const activePageTitle = readActiveH2OPageTitle();
    if (activePageTitle) setPageTitleOverride(activePageTitle, 'attach-active-library-page');
    try { renderFromState(api.getState()); } catch {}
    return true;
  }

  function installPublicApi() {
    try {
      const H2O = (W.H2O = W.H2O || {});
      publicApi = {
        version: '1.2.0',
        inspect: inspectTitleState,
        refresh(reason = 'api') {
          syncPageTitleOverride(`api:${reason}`);
          return inspectTitleState();
        },
        computeTitle() {
          return computeH2OPageTitle(readActiveH2OPage());
        },
        getActivePage() {
          const info = inspectTitleState();
          return info.activePage;
        },
      };
      H2O.TabTitle = publicApi;
    } catch {}
  }

  function scheduleAttach() {
    if (destroyed) return;
    clearTimeout(attachTimer);
    attachTimer = setTimeout(() => {
      if (!attach()) scheduleAttach();
    }, 120);
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    clearTimeout(attachTimer);
    attachTimer = 0;
    if (pageTitleSyncTimer) W.clearInterval(pageTitleSyncTimer);
    pageTitleSyncTimer = 0;
    if (pageTitleSyncFrame) {
      try { W.cancelAnimationFrame?.(pageTitleSyncFrame); } catch {}
      try { W.clearTimeout(pageTitleSyncFrame); } catch {}
    }
    pageTitleSyncFrame = 0;
    try { pageTitleObserver?.disconnect?.(); } catch {}
    pageTitleObserver = null;
    try { unsubscribe?.(); } catch {}
    unsubscribe = null;
    try { historyRestore?.(); } catch {}
    historyRestore = null;
    cleanups.forEach((fn) => {
      try { fn(); } catch {}
    });
    cleanups.clear();
    locationWatchInstalled = false;
    lastCanonicalChatState = null;
    try {
      if (W.H2O?.TabTitle === publicApi) delete W.H2O.TabTitle;
    } catch {}
    publicApi = null;
    try {
      if (W[BOOT_KEY] === runtimeHandle) delete W[BOOT_KEY];
    } catch {}
    return true;
  }

  const runtimeHandle = Object.freeze({ destroy });
  W[BOOT_KEY] = runtimeHandle;

  if (!attach()) {
    if (!readH2ORouteFromUrl()) {
      const fallback = fallbackTitle();
      if (fallback) renderTitle(fallback, 'boot-fallback');
    }
    scheduleAttach();
  }
  installPageTitleWatch();
  installLocationWatch();
  installPublicApi();
  syncPageTitleOverride('boot');
  if (D.readyState === 'loading') {
    const onDomContentLoaded = () => {
      installPageTitleWatch();
      installLocationWatch();
      installPublicApi();
      schedulePageTitleSync('domcontentloaded');
    };
    listen(D, 'DOMContentLoaded', onDomContentLoaded, { once: true });
  }

  const renderCurrentTitleState = (event) => {
    const api = W.H2O && W.H2O.ChatTitle;
    let current = event && event.detail;
    try {
      if (api && typeof api.getState === 'function') current = api.getState();
    } catch {}
    renderFromState(current);
  };
  listen(W, 'h2o:chat-title:changed', renderCurrentTitleState);
  listen(W, 'evt:h2o:chat-title:changed', renderCurrentTitleState);

  const onLibraryPageMounted = (event) => {
    const detail = event?.detail || {};
    const title = norm(
      readActiveH2OPageTitle() ||
      computeH2OPageTitle({
        kind: detail.kind || '',
        id: detail.id || '',
        title: detail.title || '',
        owner: '',
        node: null,
      })
    );
    setPageTitleOverride(title, event?.detail?.reason || 'library-page-mounted');
  };
  const onLibraryPageExited = () => {
    clearPageTitleOverride();
    schedulePageTitleSync('library-page-exited');
  };
  listen(W, 'evt:h2o:library-core:page-entered', onLibraryPageMounted);
  listen(W, 'evt:h2o:library-core:page-replaced', onLibraryPageMounted);
  listen(W, 'evt:h2o:library-core:page-exited', onLibraryPageExited);
})();
