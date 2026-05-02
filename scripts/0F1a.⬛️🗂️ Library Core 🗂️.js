// ==UserScript==
// @h2o-id             0f1a.library_core
// @name               0F1a.⬛️🗂️ Library Core 🗂️
// @namespace          H2O.Premium.CGX.library_core
// @author             HumamDev
// @version            1.2.1
// @revision           004
// @build              260424-000004
// @description        Library Core: canonical shared service registry, route/page-host/ui-shell/native-sidebar services, and ownership boundary enforcement. Template reference for all 0F-pattern feature-owner modules.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /*
   * 0F1a — Library Core (shared foundation, NOT a feature owner)
   *
   * OWNS:     Shared service registry (owners, routes, pages, views, services); route/page-host/
   *           ui-shell/native-sidebar service implementations; ownership boundary verification.
   * MUST NOT OWN: Any feature-domain logic (folders data, projects fetch, category catalog,
   *           archive workbench). No storage writes for feature state. No feature-specific UI.
   * EXPOSES:  H2O.LibraryCore — registerOwner/getOwner, registerRoute/getRoute,
   *           registerService/getService (and list/page/view variants), verifyOwnershipBoundaries,
   *           selfCheck.
   *
   * TEMPLATE PATTERN for future modules (Tags, Labels, Studio, mobile app, etc.):
   *   1. Boot order: 0F1a must load before any feature owner.
   *   2. Feature owners call: core.registerOwner(), core.registerService(), core.registerRoute().
   *   3. Features consume shared infra via: core.getService('route'), core.getService('ui-shell'),
   *      core.getService('page-host'), core.getService('native-sidebar'). Never capture at init —
   *      always call getService() at call time to avoid stale-closure bugs.
   *   4. Cross-feature compat seams (like categories-compat) are registered as services here and
   *      consumed via getService(). Seam entries must be rendering/infra only, never business logic.
   *   5. verifyOwnershipBoundaries() should be extended to include new reserved owner/route names.
   *
   * KNOWN ENCAPSULATION DEBT: uiShellService.UI_makeInShellPageShell contains a Projects-specific
   *   refresh button branch (see below). This is documented in-place and must not be extended.
   */

  const W = window;
  const H2O = (W.H2O = W.H2O || {});

  const CORE_KEY = 'LibraryCore';
  const core = (H2O[CORE_KEY] = H2O[CORE_KEY] || {});
  const diag = (core.diag = core.diag || {
    t0: performance.now(),
    steps: [],
    errors: [],
    bufMax: 160,
    errMax: 40,
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

  core.meta = core.meta || {
    owner: '0F1a.library_core',
    label: 'Library Core',
    phase: 'phase-8-library-boundary-diagnostics',
    suite: 'prm',
    host: 'cgx',
  };
  core.meta.phase = 'phase-8-library-boundary-diagnostics';

  const registries = (core.registries = core.registries || {
    routes: Object.create(null),
    owners: Object.create(null),
    pages: Object.create(null),
    views: Object.create(null),
    services: Object.create(null),
  });

  const state = (core.state = core.state || {
    initializedAt: Date.now(),
    phase1Ready: true,
    phase2Ready: true,
  });

  const contracts = (core.contracts = core.contracts || {
    frozen: true,
    // Read-only reference registry — these keys are owned by 0F3a (Folders) and 0F2a (Projects).
    // LibraryCore documents them here for shared visibility only; it does not manage or migrate them.
    storageKeys: {
      data: 'h2o:prm:cgx:fldrs:state:data:v1',
      ui: 'h2o:prm:cgx:fldrs:state:ui:v1',
      seeMore: 'h2o:prm:cgx:fldrs:state:see_more:v1',
      foldersExpanded: 'h2o:prm:cgx:fldrs:state:folders_expanded:v1',
      projectsCache: 'h2o:prm:cgx:fldrs:state:projects_cache:v1',
      projectsNativeHeaders: 'h2o:prm:cgx:fldrs:state:projects_native_headers:v1',
      legacyData: 'h2o:folders:data:v1',
      legacyUi: 'h2o:folders:ui:v1',
      legacySee: 'h2o:folders:seeMoreExpanded:v1',
      legacyExpanded: 'h2o:folders:expanded',
      legacyViewer: 'h2o:folders:v1',
    },
    routeContract: {
      owner: 'flsc:page-route:v1',
      queryFlag: 'h2o_flsc',
      queryView: 'h2o_flsc_view',
      queryId: 'h2o_flsc_id',
      supportedViews: ['projects', 'folder', 'categories', 'category', 'labels', 'label'],
    },
    publicApi: {
      keepStable: 'H2O.folders',
      phase2DelegationOnly: false,
    },
  });

  function ensureString(value) {
    return String(value || '').trim();
  }

  function registerIn(bucket, key, value, opts = {}) {
    const name = ensureString(key);
    if (!name) return false;
    const table = registries[bucket];
    if (!table || typeof table !== 'object') return false;
    if (table[name] && opts.replace !== true) {
      step(`keep-first:${bucket}`, name);
      return false;
    }
    table[name] = value;
    step(`register:${bucket}`, name);
    return true;
  }

  function getFrom(bucket, key) {
    const name = ensureString(key);
    const table = registries[bucket];
    if (!name || !table) return null;
    return table[name] || null;
  }

  function listBucket(bucket) {
    const table = registries[bucket];
    return table ? Object.keys(table) : [];
  }

  core.registerOwner = core.registerOwner || ((name, api, opts) => registerIn('owners', name, api, opts));
  core.getOwner = core.getOwner || ((name) => getFrom('owners', name));
  core.listOwners = core.listOwners || (() => listBucket('owners'));
  core.registerRoute = core.registerRoute || ((name, handler, opts) => registerIn('routes', name, handler, opts));
  core.getRoute = core.getRoute || ((name) => getFrom('routes', name));
  core.listRoutes = core.listRoutes || (() => listBucket('routes'));
  core.registerPage = core.registerPage || ((name, api, opts) => registerIn('pages', name, api, opts));
  core.getPage = core.getPage || ((name) => getFrom('pages', name));
  core.listPages = core.listPages || (() => listBucket('pages'));
  core.registerView = core.registerView || ((name, api, opts) => registerIn('views', name, api, opts));
  core.getView = core.getView || ((name) => getFrom('views', name));
  core.listViews = core.listViews || (() => listBucket('views'));
  core.registerService = core.registerService || ((name, api, opts) => registerIn('services', name, api, opts));
  core.getService = core.getService || ((name) => getFrom('services', name));
  core.listServices = core.listServices || (() => listBucket('services'));

  core.phase = {
    ...(core.phase || {}),
    getCurrent() { return 'phase-8-library-boundary-diagnostics'; },
    isBridgeOnly() { return false; },
  };

  function uniqueStrings(...lists) {
    const out = [];
    lists.flat().forEach((value) => {
      const item = ensureString(value);
      if (item && !out.includes(item)) out.push(item);
    });
    return out;
  }

  const boundarySpec = {
    requiredOwners: ['library-core', 'folders', 'categories', 'labels', 'tags', 'library-index'],
    optionalOwners: ['library-workspace', 'library-insights', 'projects'],
    requiredServices: ['route', 'page-host', 'ui-shell', 'native-sidebar', 'folders', 'categories', 'labels', 'tags', 'library-index'],
    optionalServices: ['library-workspace', 'library-insights', 'projects', 'categories-compat'],
    requiredRoutes: ['projects', 'folder', 'categories', 'category', 'labels', 'label'],
    optionalRoutes: [],
    deferredRoutes: ['tags', 'tag'],
    forbiddenServices: ['projects-compat'],
  };

  contracts.routeContract = contracts.routeContract || {};
  contracts.routeContract.supportedViews = uniqueStrings(
    contracts.routeContract.supportedViews || [],
    ['projects', 'folder', 'categories', 'category', 'labels', 'label']
  );
  contracts.routeContract.deferredViews = boundarySpec.deferredRoutes.slice();

  core.reserved = {
    ...(core.reserved || {}),
    owners: uniqueStrings(
      core.reserved?.owners || [],
      ['library-core', 'library-workspace', 'library-index', 'library-insights', 'projects', 'folders', 'categories', 'tags', 'labels']
    ),
    services: uniqueStrings(
      core.reserved?.services || [],
      ['route', 'page-host', 'ui-shell', 'native-sidebar', 'library-workspace', 'library-index', 'library-insights', 'projects', 'folders', 'categories', 'categories-compat', 'tags', 'labels']
    ),
    pages: uniqueStrings(
      core.reserved?.pages || [],
      ['library', 'projects', 'folder', 'categories', 'category', 'labels', 'label']
    ),
    routes: uniqueStrings(
      core.reserved?.routes || [],
      ['library', 'projects', 'folder', 'categories', 'category', 'labels', 'label']
    ),
    views: uniqueStrings(
      core.reserved?.views || [],
      ['viewer-shell', 'page-shell', 'library-index', 'library-insights']
    ),
    deferredRoutes: boundarySpec.deferredRoutes.slice(),
  };

  function safeRemove(env, node) {
    try {
      env?.SAFE_remove ? env.SAFE_remove(node) : node?.remove?.();
    } catch {}
  }

  function normalizeCategoryMode(env, mode) {
    return env?.STORE_normalizeCategoryOpenMode ? env.STORE_normalizeCategoryOpenMode(mode) : String(mode || 'page');
  }

  function normalizeHexColor(env, color) {
    return env?.STORE_normalizeHexColor ? env.STORE_normalizeHexColor(color) : String(color || '');
  }

  const routeService = {
    ROUTE_getSafeBaseHref(env) {
      try { return `${env.W.location.origin}/`; } catch {}
      return '/';
    },

    ROUTE_getCurrentBaseHref(env) {
      const { W, STATE, CFG_H2O_PAGE_ROUTE_OWNER, CFG_H2O_PAGE_ROUTE_PREFIX, CFG_H2O_PAGE_QUERY_FLAG, CFG_H2O_PAGE_QUERY_VIEW, CFG_H2O_PAGE_QUERY_ID } = env;
      const h2o = (W.history?.state && typeof W.history.state === 'object') ? W.history.state.h2o : null;
      if (h2o?.owner === CFG_H2O_PAGE_ROUTE_OWNER && (h2o.returnHref || h2o.baseHref)) {
        return routeService.ROUTE_getSafeBaseHref(env);
      }

      const href = String(W.location.href || '');
      try {
        const url = new URL(href, W.location.origin);
        if (routeService.ROUTE_parseUrl(env, url)) return `${url.origin}/`;
        url.searchParams.delete(CFG_H2O_PAGE_QUERY_FLAG);
        url.searchParams.delete(CFG_H2O_PAGE_QUERY_VIEW);
        url.searchParams.delete(CFG_H2O_PAGE_QUERY_ID);
        if (String(url.hash || '').startsWith(`#${CFG_H2O_PAGE_ROUTE_PREFIX}/`)) url.hash = '';
        return url.href;
      } catch {}

      const hash = String(W.location.hash || '');
      if (hash.startsWith(`#${CFG_H2O_PAGE_ROUTE_PREFIX}/`)) return href.slice(0, href.length - hash.length);
      return href.split('#')[0];
    },

    ROUTE_makeHash(env, route = {}) {
      const view = String(route.view || '').trim();
      if (view === 'projects') return `#${env.CFG_H2O_PAGE_ROUTE_PREFIX}/projects`;
      if (view === 'categories') return `#${env.CFG_H2O_PAGE_ROUTE_PREFIX}/categories`;
      if (view === 'folder' || view === 'category') {
        const id = encodeURIComponent(String(route.id || '').trim());
        return id ? `#${env.CFG_H2O_PAGE_ROUTE_PREFIX}/${view}/${id}` : '';
      }
      return '';
    },

    ROUTE_makeUrl(env, route = {}) {
      const view = String(route.view || '').trim();
      if (!view) return '';

      const url = new URL('/', env.W.location.origin);
      url.searchParams.set(env.CFG_H2O_PAGE_QUERY_FLAG, '1');
      url.searchParams.set(env.CFG_H2O_PAGE_QUERY_VIEW, view);
      if (view === 'folder' || view === 'category') {
        const id = String(route.id || '').trim();
        if (!id) return '';
        url.searchParams.set(env.CFG_H2O_PAGE_QUERY_ID, id);
      }
      return `${url.pathname}${url.search}`;
    },

    ROUTE_parseUrl(env, input = env.W.location.href) {
      let url;
      try {
        url = input instanceof URL ? input : new URL(String(input || env.W.location.href), env.W.location.href);
      } catch {
        return null;
      }

      if (url.searchParams.get(env.CFG_H2O_PAGE_QUERY_FLAG) !== '1') return null;
      const view = String(url.searchParams.get(env.CFG_H2O_PAGE_QUERY_VIEW) || '').trim();
      if (view === 'projects') return { view: 'projects', id: '' };
      if (view === 'categories') return { view: 'categories', id: '' };
      if (view === 'folder' || view === 'category') {
        const id = String(url.searchParams.get(env.CFG_H2O_PAGE_QUERY_ID) || '').trim();
        return id ? { view, id } : null;
      }
      return null;
    },

    ROUTE_parseHash(env, hash = env.W.location.hash) {
      const raw = String(hash || '').replace(/^#/, '');
      const parts = raw.split('/').filter(Boolean);
      if (parts[0] !== env.CFG_H2O_PAGE_ROUTE_PREFIX) return null;
      if (parts[1] === 'projects') return { view: 'projects', id: '' };
      if (parts[1] === 'categories') return { view: 'categories', id: '' };
      if ((parts[1] === 'folder' || parts[1] === 'category') && parts[2]) {
        try {
          return { view: parts[1], id: decodeURIComponent(parts.slice(2).join('/')) };
        } catch {
          return { view: parts[1], id: parts.slice(2).join('/') };
        }
      }
      return null;
    },

    ROUTE_parseCurrent(env) {
      const route = routeService.ROUTE_parseUrl(env, env.W.location.href) || routeService.ROUTE_parseHash(env, env.W.location.hash);
      if (!route) return null;
      const h2o = (env.W.history?.state && typeof env.W.history.state === 'object') ? env.W.history.state.h2o : null;
      return {
        ...route,
        baseHref: String(routeService.ROUTE_getSafeBaseHref(env)),
      };
    },

    ROUTE_makeState(env, route, baseHref) {
      const current = (env.W.history?.state && typeof env.W.history.state === 'object') ? env.W.history.state : {};
      const safeBaseHref = String(routeService.ROUTE_getSafeBaseHref(env));
      return {
        ...current,
        h2o: {
          owner: env.CFG_H2O_PAGE_ROUTE_OWNER,
          view: String(route.view || ''),
          id: String(route.id || ''),
          returnHref: safeBaseHref,
          baseHref: safeBaseHref,
        },
      };
    },

    ROUTE_commitPageRoute(env, route, opts = {}) {
      const normalized = {
        view: String(route?.view || '').trim(),
        id: String(route?.id || '').trim(),
      };
      if (!normalized.view) return;

      const baseHref = String(routeService.ROUTE_getSafeBaseHref(env));
      env.STATE.pageRoute = { ...normalized, baseHref };

      if (opts.fromRoute || opts.skipHistory) return;

      const routeUrl = routeService.ROUTE_makeUrl(env, normalized);
      if (!routeUrl) return;

      const current = routeService.ROUTE_parseCurrent(env);
      const sameRoute = current && current.view === normalized.view && String(current.id || '') === normalized.id;
      const state = routeService.ROUTE_makeState(env, normalized, baseHref);
      try {
        if (sameRoute) env.W.history.replaceState(state, '', routeUrl);
        else env.W.history.pushState(state, '', routeUrl);
      } catch (error) {
        err('routeCommit', error);
      }
    },

    ROUTE_clearPageRoute(env) {
      env.STATE.pageRoute = null;
    },

    async ROUTE_dispatchRoute(env, route, opts = {}) {
      const normalized = {
        view: String(route?.view || '').trim(),
        id: String(route?.id || '').trim(),
        baseHref: String(route?.baseHref || ''),
        routeToken: route?.routeToken,
        reason: String(opts.reason || ''),
      };
      if (!normalized.view) return false;
      const handler = core.getRoute?.(normalized.view);
      if (typeof handler !== 'function') return false;
      const result = await handler({ ...route, ...normalized, ...opts });
      return result !== false;
    },
  };

  const nativeSidebarService = {
    normalizeText(raw = '') {
      return String(raw || '').trim().replace(/\s+/g, ' ');
    },

    closestDirectChild(parent, node) {
      if (!(parent instanceof HTMLElement) || !(node instanceof HTMLElement)) return null;
      let cur = node;
      while (cur && cur.parentElement && cur.parentElement !== parent) cur = cur.parentElement;
      return cur instanceof HTMLElement && cur.parentElement === parent ? cur : null;
    },

    closestH2OOwnedNode(node) {
      try {
        const el = node?.nodeType === 1
          ? node
          : (node?.parentElement || (node?.parentNode?.nodeType === 1 ? node.parentNode : null));
        if (!el || typeof el.closest !== 'function') return null;
        return el.matches?.('[data-cgxui-owner],[data-cgxui]')
          ? el
          : el.closest('[data-cgxui-owner],[data-cgxui]');
      } catch {
        return null;
      }
    },

    isH2OOwnedNode(node) {
      return !!nativeSidebarService.closestH2OOwnedNode(node);
    },

    mutationHasOnlyH2OOwnedNodes(mutations) {
      try {
        const muts = Array.isArray(mutations) ? mutations : [...(mutations || [])];
        let seen = false;
        for (const mu of muts) {
          const nodes = mu?.type === 'childList'
            ? [...(mu.addedNodes || []), ...(mu.removedNodes || [])]
            : [mu?.target].filter(Boolean);
          for (const node of nodes) {
            if (!node) continue;
            seen = true;
            if (!nativeSidebarService.isH2OOwnedNode(node)) return false;
          }
        }
        return seen;
      } catch {
        return false;
      }
    },

    findSidebarNav(env = {}) {
      const root = env.D || document;
      const selectors = Array.isArray(env.sidebarNavSelectors) && env.sidebarNavSelectors.length
        ? env.sidebarNavSelectors
        : [
          '#stage-slideover-sidebar nav[aria-label="Chat history"]',
          '#stage-slideover-sidebar nav',
          'nav[aria-label="Chat history"]',
        ];
      for (const selector of selectors) {
        try {
          const node = root.querySelector(selector);
          if (node instanceof HTMLElement) return node;
        } catch {}
      }
      try {
        const newChat = nativeSidebarService.findExpandedNewChatButton(env);
        const nav = newChat?.closest?.('nav');
        if (nav instanceof HTMLElement) return nav;
      } catch {}
      return null;
    },

    isExpandedNewChatButton(node) {
      try {
        if (!(node instanceof HTMLElement)) return false;
        if (node.closest?.('#stage-sidebar-tiny-bar')) return false;
        if (node.closest?.('[data-cgxui-owner],[data-cgxui]')) return false;
        const testId = String(node.getAttribute('data-testid') || '');
        const href = String(node.getAttribute('href') || node.closest?.('a[href]')?.getAttribute?.('href') || '');
        const label = nativeSidebarService.normalizeText(node.textContent || node.getAttribute('aria-label') || '');
        const looksNewChat = testId === 'create-new-chat-button' || (href === '/' && /^New chat$/i.test(label));
        if (!looksNewChat) return false;
        const li = node.closest?.('li');
        return !!(li instanceof HTMLElement && li.parentElement instanceof HTMLElement && li.parentElement.tagName === 'UL');
      } catch {
        return false;
      }
    },

    findExpandedNewChatButton(env = {}) {
      const root = env.D || document;
      const candidates = [];
      const add = (node) => {
        if (node instanceof HTMLElement && !candidates.includes(node)) candidates.push(node);
      };
      try { root.querySelectorAll('[data-testid="create-new-chat-button"]').forEach(add); } catch {}
      try { root.querySelectorAll('a[href="/"][data-sidebar-item="true"]').forEach(add); } catch {}
      return candidates.find((node) => nativeSidebarService.isExpandedNewChatButton(node)) || null;
    },

    findTopActionList(env = {}) {
      const newChat = nativeSidebarService.findExpandedNewChatButton(env);
      const li = newChat?.closest?.('li');
      const ul = li?.parentElement || null;
      return ul instanceof HTMLElement && ul.tagName === 'UL'
        ? { ul, newChat, newChatLi: li }
        : { ul: null, newChat, newChatLi: li || null };
    },

    findNativeHeaderSection(env = {}, matcherRaw = /projects|recents/i) {
      const root = nativeSidebarService.findSidebarNav(env) || env.D || document;
      const selector = String(env.projectsLabelSelector || 'h2.__menu-label');
      const normalizeText = typeof env.normalizeText === 'function'
        ? env.normalizeText
        : nativeSidebarService.normalizeText;
      const matcher = matcherRaw instanceof RegExp ? matcherRaw : /projects|recents/i;
      let labels = [];
      try { labels = [...root.querySelectorAll(selector)]; } catch {}
      const h2 = labels.find((el) => !nativeSidebarService.closestH2OOwnedNode(el) && matcher.test(normalizeText(el.textContent || ''))) || null;
      if (!h2) return null;
      const btn = h2.closest('button');
      const section = nativeSidebarService.findProjectsSection(env, h2) ||
        btn?.closest?.('div[class*="sidebar-expando-section"]') ||
        btn?.parentElement ||
        h2.parentElement ||
        null;
      return section instanceof HTMLElement ? section : null;
    },

    findPrepaintInsertionTarget(env = {}) {
      const nav = nativeSidebarService.findSidebarNav(env);
      if (!(nav instanceof HTMLElement)) return { nav: null, parent: null, beforeNode: null, anchor: null, topList: null, reason: 'sidebar-nav-not-found' };

      const projectsSection = nativeSidebarService.findProjectsSection(
        env,
        nativeSidebarService.findProjectsH2(env)
      );
      const lowerAnchor = projectsSection ||
        nativeSidebarService.findNativeHeaderSection(env, /^recents?\b/i) ||
        nativeSidebarService.findNativeHeaderSection(env, /./);
      if (lowerAnchor instanceof HTMLElement && lowerAnchor.parentElement instanceof HTMLElement) {
        return { nav, parent: lowerAnchor.parentElement, beforeNode: lowerAnchor, anchor: lowerAnchor, topList: null, reason: '' };
      }

      const topList = nativeSidebarService.findTopActionList(env);
      const topBlock = nativeSidebarService.closestDirectChild(nav, topList.ul);
      if (topBlock instanceof HTMLElement) {
        return { nav, parent: nav, beforeNode: topBlock.nextElementSibling || null, anchor: topBlock, topList: topList.ul, reason: '' };
      }

      return { nav, parent: nav, beforeNode: null, anchor: nav.lastElementChild || null, topList: null, reason: '' };
    },

    findOwnedRoot(token, owner = '', root = null) {
      const base = root && typeof root.querySelector === 'function' ? root : document;
      const tokenText = String(token || '').replace(/"/g, '\\"');
      const ownerText = String(owner || '').replace(/"/g, '\\"');
      if (!tokenText) return null;
      const selector = ownerText
        ? `[data-cgxui="${tokenText}"][data-cgxui-owner="${ownerText}"]`
        : `[data-cgxui="${tokenText}"]`;
      try {
        const node = base.querySelector(selector);
        return node instanceof HTMLElement ? node : null;
      } catch {
        return null;
      }
    },

    removeDuplicateOwnedRoots(token, owner = '', root = null, keep = null) {
      const base = root && typeof root.querySelectorAll === 'function' ? root : document;
      const tokenText = String(token || '').replace(/"/g, '\\"');
      const ownerText = String(owner || '').replace(/"/g, '\\"');
      if (!tokenText) return 0;
      const selector = ownerText
        ? `[data-cgxui="${tokenText}"][data-cgxui-owner="${ownerText}"]`
        : `[data-cgxui="${tokenText}"]`;
      let removed = 0;
      try {
        const nodes = [...base.querySelectorAll(selector)].filter((node) => node instanceof HTMLElement);
        const survivor = keep instanceof HTMLElement ? keep : nodes[0] || null;
        nodes.forEach((node) => {
          if (node === survivor) return;
          try { node.remove(); removed += 1; } catch {}
        });
      } catch {}
      return removed;
    },

    findProjectsH2(env = {}) {
      const root = env.D || document;
      const selector = String(env.projectsLabelSelector || 'h2.__menu-label');
      const normalizeText = typeof env.normalizeText === 'function'
        ? env.normalizeText
        : ((raw) => String(raw || '').trim().replace(/\s+/g, ' '));
      const matcher = env.projectsHeaderMatcher instanceof RegExp ? env.projectsHeaderMatcher : /projects/i;
      const labels = [...root.querySelectorAll(selector)];
      return labels.find((el) => matcher.test(normalizeText(el.textContent || ''))) || null;
    },

    findProjectsSection(env = {}, h2) {
      if (!h2) return null;
      const btn = h2.closest('button');
      if (!btn) return null;
      const selectors = Array.isArray(env.projectsSectionSelectors) && env.projectsSectionSelectors.length
        ? env.projectsSectionSelectors
        : ['div.group\\/sidebar-expando-section', 'div[class*="sidebar-expando-section"]'];
      for (const selector of selectors) {
        const section = btn.closest(selector);
        if (section) return section;
      }
      return null;
    },

    getProjectsMoreRow(env = {}, projectsSection = null) {
      const section = projectsSection || nativeSidebarService.findProjectsSection(
        env,
        nativeSidebarService.findProjectsH2(env)
      );
      if (!section) return null;
      const rowSelector = String(env.sidebarItemSelector || '.__menu-item');
      const normalizeText = typeof env.normalizeText === 'function'
        ? env.normalizeText
        : ((raw) => String(raw || '').trim().replace(/\s+/g, ' '));
      const label = String(env.moreLabel || 'More');
      return [...section.querySelectorAll(rowSelector)].find((row) => normalizeText(row.textContent || '') === label) || null;
    },
  };

  const pageHostService = {
    UI_makePageHostRoot(env, meta = {}) {
      const root = env.D.createElement('div');
      root.setAttribute(env.ATTR_CGXUI, env.UI_FSECTION_PAGE_HOST);
      root.setAttribute(env.ATTR_CGXUI_OWNER, env.SkID);
      root.setAttribute('data-cgxui-page-kind', String(meta.kind || 'library'));
      root.setAttribute('data-cgxui-page-title', String(meta.title || ''));
      root.setAttribute('role', 'main');
      root.setAttribute('aria-label', String(meta.title || 'Library page'));
      return root;
    },

    PAGEHOST_normalizeHeaderText(raw = '') {
      return String(raw || '').replace(/\s+/g, ' ').trim();
    },

    PAGEHOST_getHiddenAttr(env) {
      return String(env?.ATTR_CGXUI_PAGE_HIDDEN || 'data-cgxui-page-hidden-by');
    },

    PAGEHOST_isExcludedHeaderNode(env, session, el) {
      if (!(el instanceof HTMLElement)) return true;
      const hiddenAttr = pageHostService.PAGEHOST_getHiddenAttr(env);
      const ownerAttr = String(env?.ATTR_CGXUI_OWNER || 'data-cgxui-owner');
      const cgxAttr = String(env?.ATTR_CGXUI || 'data-cgxui');
      const excludedClosest = [
        'aside',
        'nav',
        '[role="dialog"]',
        '[role="menu"]',
        '[role="listbox"]',
        '[data-radix-popper-content-wrapper]',
        '[data-headlessui-portal]',
        `[${ownerAttr}]`,
        `[${cgxAttr}]`,
      ].join(',');
      if (el.closest?.(excludedClosest)) return true;
      if (session?.root instanceof HTMLElement && session.root.contains(el)) return true;
      if (session?.host instanceof HTMLElement && session.host.contains(el)) return true;
      if (el.hasAttribute(hiddenAttr)) return true;
      return false;
    },

    PAGEHOST_isSafeHeaderScope(env, session, el) {
      if (pageHostService.PAGEHOST_isExcludedHeaderNode(env, session, el)) return false;
      const rect = el.getBoundingClientRect?.();
      if (!rect || rect.width < 24 || rect.height < 12) return false;
      const win = env?.W || W;
      if (rect.top > Math.max(180, win.innerHeight * 0.22)) return false;
      return true;
    },

    PAGEHOST_isLikelyHeaderTitleNode(env, session, el) {
      if (pageHostService.PAGEHOST_isExcludedHeaderNode(env, session, el)) return false;
      const text = pageHostService.PAGEHOST_normalizeHeaderText(el.textContent || '');
      if (text.length < 2 || text.length > 160) return false;
      if (/^(chatgpt|new chat|search|share|upgrade|settings|profile|account|help|apps)$/i.test(text)) return false;

      const tag = String(el.tagName || '').toLowerCase();
      if (['header', 'main', 'nav', 'aside', 'form'].includes(tag)) return false;
      if (el.matches?.('input,textarea,select,[contenteditable="true"]')) return false;

      const rect = el.getBoundingClientRect?.();
      if (!rect || rect.width < 18 || rect.height < 8) return false;
      const win = env?.W || W;
      if (rect.top > Math.max(180, win.innerHeight * 0.22)) return false;
      if (rect.left > win.innerWidth * 0.62) return false;
      if (rect.width > Math.min(560, win.innerWidth * 0.72) || rect.height > 72) return false;

      const controls = el.querySelectorAll?.('button,a,input,textarea,select,[role="button"],[role="menuitem"]')?.length || 0;
      if (controls > 1) return false;

      const control = el.closest?.('button,a,[role="button"]');
      if (control instanceof HTMLElement) {
        const label = [
          control.getAttribute('aria-label'),
          control.getAttribute('title'),
          control.getAttribute('data-testid'),
        ].map((v) => String(v || '').toLowerCase()).join(' ');
        if (/sidebar|new chat|search|share|profile|account|settings|apps|help|voice|notification|upgrade/.test(label)) return false;
      }

      return true;
    },

    PAGEHOST_pickSafeHeaderTitleTarget(env, session, node) {
      if (!pageHostService.PAGEHOST_isLikelyHeaderTitleNode(env, session, node)) return null;

      let target = node;
      const control = target.closest?.('button,a,[role="button"]');
      if (control instanceof HTMLElement && !pageHostService.PAGEHOST_isExcludedHeaderNode(env, session, control)) {
        const controlText = pageHostService.PAGEHOST_normalizeHeaderText(control.textContent || '');
        const controlRect = control.getBoundingClientRect?.();
        const win = env?.W || W;
        const label = [
          control.getAttribute('aria-label'),
          control.getAttribute('title'),
          control.getAttribute('data-testid'),
        ].map((v) => String(v || '').toLowerCase()).join(' ');
        const globalControl = /sidebar|new chat|search|share|profile|account|settings|apps|help|voice|notification|upgrade/.test(label);
        if (
          !globalControl &&
          controlText.length >= 2 &&
          controlText.length <= 160 &&
          controlRect &&
          controlRect.width >= 24 &&
          controlRect.height >= 12 &&
          controlRect.top <= Math.max(180, win.innerHeight * 0.22) &&
          controlRect.left <= win.innerWidth * 0.62 &&
          controlRect.width <= Math.min(620, win.innerWidth * 0.76) &&
          controlRect.height <= 80
        ) {
          target = control;
        }
      }

      const rect = target.getBoundingClientRect?.();
      if (!rect || rect.width < 18 || rect.height < 8) return null;
      if (target.matches?.('header,[data-testid="page-header"],[role="banner"]')) return null;
      return target;
    },

    PAGEHOST_findTitleCandidateInScope(env, session, scope) {
      const selectors = [
        '[data-testid="conversation-title"]',
        '[data-testid="project-title"]',
        '[data-testid="thread-title"]',
        '[data-testid="page-title"]',
        '[data-testid*="title"]',
        '[aria-label="Chat title"]',
        '[aria-label="Project title"]',
        'h1',
        'h2',
        '[class*="truncate"]',
      ];

      for (const selector of selectors) {
        const nodes = [];
        try {
          if (scope.matches?.(selector)) nodes.push(scope);
          nodes.push(...scope.querySelectorAll(selector));
        } catch {}

        for (const node of nodes) {
          const target = pageHostService.PAGEHOST_pickSafeHeaderTitleTarget(env, session, node);
          if (target) return { target, selector };
        }
      }

      return null;
    },

    PAGEHOST_findNativeHeaderContext(env, session) {
      const root = env?.D || document;
      const scopeSelectors = [
        '[data-testid="page-header"]',
        '[role="banner"]',
        'header',
        '[data-headlessui-state] header',
      ];

      for (const selector of scopeSelectors) {
        let scopes = [];
        try { scopes = [...root.querySelectorAll(selector)]; } catch {}
        for (const scope of scopes) {
          if (!pageHostService.PAGEHOST_isSafeHeaderScope(env, session, scope)) continue;
          const found = pageHostService.PAGEHOST_findTitleCandidateInScope(env, session, scope);
          if (found?.target) return { ...found, scope, scopeSelector: selector };
        }
      }

      return null;
    },

    PAGEHOST_hideHeaderContextTarget(env, session, found) {
      const el = found?.target;
      if (!(el instanceof HTMLElement)) return false;

      const hiddenAttr = pageHostService.PAGEHOST_getHiddenAttr(env);
      const headerContext = (session.headerContext = session.headerContext || { records: [], timers: [] });
      if (headerContext.records.some((record) => record?.el === el)) return true;

      const record = {
        el,
        display: el.style.display || '',
        visibility: el.style.visibility || '',
        pointerEvents: el.style.pointerEvents || '',
        ariaHidden: el.getAttribute('aria-hidden'),
        hiddenAttr,
        hiddenAttrValue: el.getAttribute(hiddenAttr),
        hiddenKind: el.getAttribute('data-cgxui-page-hidden-kind'),
        selector: found.selector || '',
        scopeSelector: found.scopeSelector || '',
        text: pageHostService.PAGEHOST_normalizeHeaderText(el.textContent || '').slice(0, 160),
      };

      headerContext.records.push(record);
      if (Array.isArray(env.STATE?.pageHiddenRecords) && !env.STATE.pageHiddenRecords.some((item) => item?.el === el)) {
        env.STATE.pageHiddenRecords.push(record);
      }

      try {
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
        el.setAttribute('aria-hidden', 'true');
        el.setAttribute(hiddenAttr, String(env?.SkID || 'library-core'));
        el.setAttribute('data-cgxui-page-hidden-kind', 'header-context');
      } catch {}
      return true;
    },

    PAGEHOST_isolateHeaderContext(env, session) {
      if (!session || session !== env.STATE?.pageSession) return false;
      if (!(session.root instanceof HTMLElement) || !session.root.isConnected) return false;

      const found = pageHostService.PAGEHOST_findNativeHeaderContext(env, session);
      if (!found?.target) return false;
      return pageHostService.PAGEHOST_hideHeaderContextTarget(env, session, found);
    },

    PAGEHOST_clearHeaderContextTimers(env, session) {
      const timers = session?.headerContext?.timers;
      if (!Array.isArray(timers) || !timers.length) return;
      timers.splice(0).forEach((timer) => {
        try { (env?.W || W).clearTimeout(timer); } catch {}
        try { env?.CLEAN?.timers?.delete?.(timer); } catch {}
      });
    },

    PAGEHOST_restoreHeaderContext(env, session) {
      if (!session) return;
      pageHostService.PAGEHOST_clearHeaderContextTimers(env, session);

      const records = Array.isArray(session.headerContext?.records) ? session.headerContext.records.splice(0) : [];
      records.forEach((record) => {
        const el = record?.el;
        if (!(el instanceof HTMLElement)) return;
        try {
          el.style.display = record.display || '';
          el.style.visibility = record.visibility || '';
          el.style.pointerEvents = record.pointerEvents || '';
          if (record.ariaHidden == null) el.removeAttribute('aria-hidden');
          else el.setAttribute('aria-hidden', record.ariaHidden);
          const hiddenAttr = String(record.hiddenAttr || pageHostService.PAGEHOST_getHiddenAttr(env));
          if (record.hiddenAttrValue == null) el.removeAttribute(hiddenAttr);
          else el.setAttribute(hiddenAttr, record.hiddenAttrValue);
          if (record.hiddenKind == null) el.removeAttribute('data-cgxui-page-hidden-kind');
          else el.setAttribute('data-cgxui-page-hidden-kind', record.hiddenKind);
        } catch {}
      });

      if (Array.isArray(env.STATE?.pageHiddenRecords) && records.length) {
        env.STATE.pageHiddenRecords = env.STATE.pageHiddenRecords.filter((record) => !records.includes(record));
      }
    },

    PAGEHOST_isSkippableHostChild(env, child, host) {
      if (!(child instanceof HTMLElement)) return true;
      if (!(host instanceof HTMLElement) || child.parentNode !== host) return true;
      if (!child.isConnected) return true;

      const tag = String(child.tagName || '').toLowerCase();
      if (['script', 'style', 'link', 'meta'].includes(tag)) return true;

      const ownerAttr = String(env?.ATTR_CGXUI_OWNER || 'data-cgxui-owner');
      const cgxAttr = String(env?.ATTR_CGXUI || 'data-cgxui');
      if (child.hasAttribute(ownerAttr) || child.hasAttribute(cgxAttr)) return true;

      const skipSelectors = [
        'dialog',
        '[role="dialog"]',
        '[role="alertdialog"]',
        '[role="menu"]',
        '[role="listbox"]',
        '[role="tooltip"]',
        '[popover]',
        '[data-radix-portal]',
        '[data-radix-popper-content-wrapper]',
        '[data-headlessui-portal]',
        '[data-sonner-toaster]',
        '[data-hot-toast]',
        '[data-toast]',
        '[class*="toast" i]',
        '[class*="portal" i]',
        '[class*="popover" i]',
        '[class*="modal" i]',
      ].join(',');
      try {
        if (child.matches?.(skipSelectors)) return true;
      } catch {}

      let style = null;
      try { style = (env?.W || W).getComputedStyle?.(child) || null; } catch {}
      if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse')) return true;

      try {
        const rects = child.getClientRects?.();
        if (!rects || rects.length < 1) return true;
      } catch {}

      return false;
    },

    PAGEHOST_hideHostChildren(env, session, host) {
      if (!(host instanceof HTMLElement)) return [];
      const hiddenAttr = pageHostService.PAGEHOST_getHiddenAttr(env);
      const owner = String(env?.SkID || 'library-core');
      const records = [];

      [...host.children].forEach((child) => {
        if (pageHostService.PAGEHOST_isSkippableHostChild(env, child, host)) return;

        const record = {
          el: child,
          host,
          display: child.style.display || '',
          ariaHidden: child.getAttribute('aria-hidden'),
          hiddenAttr,
          hiddenAttrValue: child.getAttribute(hiddenAttr),
          hiddenKind: child.getAttribute('data-cgxui-page-hidden-kind'),
        };
        records.push(record);

        try {
          child.style.display = 'none';
          child.setAttribute('aria-hidden', 'true');
          child.setAttribute(hiddenAttr, owner);
          child.setAttribute('data-cgxui-page-hidden-kind', 'host-child');
        } catch {}
      });

      if (session) session.hiddenChildrenRecords = records;
      return records;
    },

    PAGEHOST_restoreHiddenHostChildren(env, session) {
      const records = Array.isArray(session?.hiddenChildrenRecords) ? session.hiddenChildrenRecords.splice(0) : [];
      records.forEach((record) => {
        const el = record?.el;
        if (!(el instanceof HTMLElement) || !el.isConnected) return;
        try {
          el.style.display = record.display || '';
          if (record.ariaHidden == null) el.removeAttribute('aria-hidden');
          else el.setAttribute('aria-hidden', record.ariaHidden);

          const hiddenAttr = String(record.hiddenAttr || pageHostService.PAGEHOST_getHiddenAttr(env));
          if (record.hiddenAttrValue == null) el.removeAttribute(hiddenAttr);
          else el.setAttribute(hiddenAttr, record.hiddenAttrValue);

          if (record.hiddenKind == null) el.removeAttribute('data-cgxui-page-hidden-kind');
          else el.setAttribute('data-cgxui-page-hidden-kind', record.hiddenKind);
        } catch {}
      });
    },

    PAGEHOST_removeOwnedPageRoot(env, root) {
      if (!(root instanceof HTMLElement)) return false;
      const ownerAttr = String(env?.ATTR_CGXUI_OWNER || 'data-cgxui-owner');
      const cgxAttr = String(env?.ATTR_CGXUI || 'data-cgxui');
      const expectedOwner = String(env?.SkID || '');
      const expectedToken = String(env?.UI_FSECTION_PAGE_HOST || '');
      if (expectedOwner && root.getAttribute(ownerAttr) !== expectedOwner) return false;
      if (expectedToken && root.getAttribute(cgxAttr) !== expectedToken) return false;

      try { env?.CLEAN?.nodes?.delete?.(root); } catch {}
      const parent = root.parentNode;
      if (!parent) return false;
      try {
        if (root.parentNode === parent) parent.removeChild(root);
        return true;
      } catch {
        try { root.remove?.(); return true; } catch {}
      }
      return false;
    },

    PAGEHOST_emitPageExit(env, reason = 'page-exit') {
      try {
        (env?.W || W).dispatchEvent(new CustomEvent('evt:h2o:library-core:page-exited', {
          detail: {
            reason: String(reason || ''),
            ts: Date.now(),
          },
        }));
      } catch {}
    },

    PAGEHOST_isH2OPageHref(env, href = '') {
      try {
        const url = new URL(String(href || ''), env?.W?.location?.href || W.location.href);
        return !!(routeService.ROUTE_parseUrl(env, url) || routeService.ROUTE_parseHash(env, url.hash));
      } catch {
        return false;
      }
    },

    PAGEHOST_isNativeNavigationHref(env, href = '') {
      const win = env?.W || W;
      let url;
      try {
        url = new URL(String(href || ''), win.location.href);
      } catch {
        return false;
      }
      if (!/^https?:$/i.test(url.protocol)) return false;
      if (url.origin !== win.location.origin) return false;
      if (pageHostService.PAGEHOST_isH2OPageHref(env, url.href)) return false;
      if (url.href === win.location.href) return false;
      return true;
    },

    PAGEHOST_clearNativeNavigationGuards(env, session) {
      const cleanups = session?.nativeNavigationCleanups;
      if (!Array.isArray(cleanups) || !cleanups.length) return;
      cleanups.splice(0).forEach((fn) => {
        try { fn?.(); } catch {}
      });
    },

    PAGEHOST_bindNativeNavigationGuards(env, session) {
      if (!session || session !== env.STATE?.pageSession) return;
      if (Array.isArray(session.nativeNavigationCleanups) && session.nativeNavigationCleanups.length) return;

      const doc = env?.D || document;
      const win = env?.W || W;
      session.nativeNavigationCleanups = [];

      const exitIfNativeLocation = (reason) => {
        try {
          if (!pageHostService.PAGEHOST_isH2OPageHref(env, win.location.href)) {
            pageHostService.PAGEHOST_exitForNativeNavigation(env, reason);
          }
        } catch {}
      };

      const onClick = (event) => {
        if (event.defaultPrevented) return;
        if (event.button && event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target?.closest?.('a[href]');
        if (!(link instanceof HTMLAnchorElement)) return;
        if (link.hasAttribute('download')) return;
        const target = String(link.getAttribute('target') || '').trim().toLowerCase();
        if (target && target !== '_self') return;
        if (!pageHostService.PAGEHOST_isNativeNavigationHref(env, link.href)) return;

        // Native ChatGPT routing owns this click. Remove the H2O page root synchronously
        // and avoid restoring stale native DOM into a host React is about to replace.
        pageHostService.PAGEHOST_exitForNativeNavigation(env, 'native-click');
      };

      const onPopState = () => exitIfNativeLocation('native-popstate');
      const onHashChange = () => exitIfNativeLocation('native-hashchange');

      try {
        doc.addEventListener('click', onClick, true);
        session.nativeNavigationCleanups.push(() => doc.removeEventListener('click', onClick, true));
      } catch {}
      try {
        win.addEventListener('popstate', onPopState, true);
        session.nativeNavigationCleanups.push(() => win.removeEventListener('popstate', onPopState, true));
      } catch {}
      try {
        win.addEventListener('hashchange', onHashChange, true);
        session.nativeNavigationCleanups.push(() => win.removeEventListener('hashchange', onHashChange, true));
      } catch {}
    },

    PAGEHOST_isNativeNavigationRestoreReason(reason = '') {
      return /^(page-link|pushstate|replacestate|hashchange|popstate|native-|route-exit:|route-missing:)/.test(String(reason || ''));
    },

    PAGEHOST_exitForNativeNavigation(env, reason = 'native-navigation') {
      const session = env.STATE?.pageSession;
      if (!session) return false;

      const root = session.root;
      pageHostService.PAGEHOST_restoreHeaderContext(env, session);
      pageHostService.PAGEHOST_clearNativeNavigationGuards(env, session);
      pageHostService.PAGEHOST_removeOwnedPageRoot(env, root);
      pageHostService.PAGEHOST_restoreHiddenHostChildren(env, session);

      env.STATE.pageSession = null;
      env.STATE.pageEl = null;
      env.STATE.pageHost = null;
      env.STATE.pageHiddenRecords = [];
      env.STATE.pageNativeExit = { reason: String(reason || ''), ts: Date.now() };
      routeService.ROUTE_clearPageRoute(env);
      pageHostService.PAGEHOST_emitPageExit(env, reason);
      return true;
    },

    PAGEHOST_syncHeaderContext(env, session) {
      if (!session || session !== env.STATE?.pageSession) return false;
      if (!(session.root instanceof HTMLElement) || !session.root.isConnected) return false;
      return pageHostService.PAGEHOST_isolateHeaderContext(env, session);
    },

    PAGEHOST_scheduleHeaderContextSync(env, session) {
      if (!session || session !== env.STATE?.pageSession) return;
      pageHostService.PAGEHOST_clearHeaderContextTimers(env, session);
      const headerContext = (session.headerContext = session.headerContext || { records: [], timers: [] });
      [80, 220, 520, 1000, 1800].forEach((delay) => {
        const timer = (env?.W || W).setTimeout(() => {
          try { env?.CLEAN?.timers?.delete?.(timer); } catch {}
          try { pageHostService.PAGEHOST_syncHeaderContext(env, session); } catch (error) { err('pageHostHeaderSync', error); }
        }, delay);
        headerContext.timers.push(timer);
        try { env?.CLEAN?.timers?.add?.(timer); } catch {}
      });
    },

    PAGEHOST_replaceCurrentPage(env, pageEl, meta = {}) {
      const session = env.STATE.pageSession;
      const root = session?.root;
      if (!session || !(root instanceof HTMLElement) || !root.isConnected || !(pageEl instanceof HTMLElement)) return false;

      while (root.firstChild) root.removeChild(root.firstChild);
      root.setAttribute('data-cgxui-page-kind', String(meta.kind || session.kind || 'library'));
      root.setAttribute('data-cgxui-page-title', String(meta.title || session.title || ''));
      root.setAttribute('aria-label', String(meta.title || session.title || 'Library page'));
      root.appendChild(pageEl);

      session.pageEl = pageEl;
      session.kind = String(meta.kind || session.kind || 'library');
      session.title = String(meta.title || session.title || '');
      session.replacedAt = Date.now();
      env.STATE.pageEl = pageEl;
      env.STATE.pageHost = session.host;
      pageHostService.PAGEHOST_isolateHeaderContext(env, session);
      pageHostService.PAGEHOST_scheduleHeaderContextSync(env, session);
      pageHostService.PAGEHOST_bindNativeNavigationGuards(env, session);
      return true;
    },

    PAGEHOST_restorePreviousPage(env, reason = 'restore') {
      const session = env.STATE.pageSession;
      if (session) {
        if (pageHostService.PAGEHOST_isNativeNavigationRestoreReason(reason)) {
          pageHostService.PAGEHOST_exitForNativeNavigation(env, reason);
          return;
        }

        const root = session.root;

        pageHostService.PAGEHOST_restoreHeaderContext(env, session);
        pageHostService.PAGEHOST_clearNativeNavigationGuards(env, session);
        pageHostService.PAGEHOST_removeOwnedPageRoot(env, root);
        pageHostService.PAGEHOST_restoreHiddenHostChildren(env, session);

        env.STATE.pageSession = null;
        env.STATE.pageEl = null;
        env.STATE.pageHost = null;
        env.STATE.pageHiddenRecords = [];
        routeService.ROUTE_clearPageRoute(env);
        pageHostService.PAGEHOST_emitPageExit(env, reason);
        return;
      }

      const pageEl = env.STATE.pageEl;
      if (pageEl) {
        try { env.CLEAN.nodes.delete?.(pageEl); } catch {}
        safeRemove(env, pageEl);
      }
      const records = Array.isArray(env.STATE.pageHiddenRecords) ? env.STATE.pageHiddenRecords : [];
      records.forEach((record) => {
        const el = record?.el;
        if (!(el instanceof HTMLElement)) return;
        try {
          el.style.display = record.display || '';
          if ('visibility' in record) el.style.visibility = record.visibility || '';
          if ('pointerEvents' in record) el.style.pointerEvents = record.pointerEvents || '';
          if (record.ariaHidden == null) el.removeAttribute('aria-hidden');
          else el.setAttribute('aria-hidden', record.ariaHidden);
          const hiddenAttr = String(record.hiddenAttr || env.ATTR_CGXUI_PAGE_HIDDEN || 'data-cgxui-page-hidden-by');
          if (record.hiddenAttrValue == null) el.removeAttribute(hiddenAttr);
          else el.setAttribute(hiddenAttr, record.hiddenAttrValue);
          if (record.hiddenKind == null) el.removeAttribute('data-cgxui-page-hidden-kind');
          else el.setAttribute('data-cgxui-page-hidden-kind', record.hiddenKind);
        } catch {}
      });

      env.STATE.pageEl = null;
      env.STATE.pageHost = null;
      env.STATE.pageHiddenRecords = [];
      routeService.ROUTE_clearPageRoute(env);
      pageHostService.PAGEHOST_emitPageExit(env, reason);
    },

    UI_restoreInShellPage(env, reason = 'restore') {
      return pageHostService.PAGEHOST_restorePreviousPage(env, reason);
    },

    UI_closeViewer(env) {
      pageHostService.UI_restoreInShellPage(env);
      if (env.STATE.viewerEl) safeRemove(env, env.STATE.viewerEl);
      env.STATE.viewerEl = null;
    },

    PAGEHOST_enterPage(env, pageEl) {
      const host = env.DOM_resolveRightPanePageHost();
      if (!host || !(pageEl instanceof HTMLElement)) return false;

      if (env.STATE.viewerEl) {
        safeRemove(env, env.STATE.viewerEl);
        env.STATE.viewerEl = null;
      }

      const currentSession = env.STATE.pageSession;
      if (currentSession?.host === host && currentSession?.root instanceof HTMLElement && currentSession.root.isConnected) {
        return pageHostService.PAGEHOST_replaceCurrentPage(env, pageEl, {
          kind: pageEl.getAttribute('data-cgxui-page-kind') || 'library',
          title: pageEl.getAttribute('data-cgxui-page-title') || '',
        });
      }

      pageHostService.UI_restoreInShellPage(env, 'enter-new-host');

      const root = pageHostService.UI_makePageHostRoot(env, {
        kind: pageEl.getAttribute('data-cgxui-page-kind') || 'library',
        title: pageEl.getAttribute('data-cgxui-page-title') || '',
      });
      root.appendChild(pageEl);
      host.appendChild(root);
      env.CLEAN.nodes.add(root);

      env.STATE.pageSeq += 1;
      env.STATE.pageSession = {
        id: `${env.SkID}:page:${env.STATE.pageSeq}`,
        host,
        root,
        pageEl,
        hiddenChildrenRecords: [],
        kind: root.getAttribute('data-cgxui-page-kind') || 'library',
        title: root.getAttribute('data-cgxui-page-title') || '',
        enteredAt: Date.now(),
        url: env.W.location.href,
      };
      pageHostService.PAGEHOST_hideHostChildren(env, env.STATE.pageSession, host);
      env.STATE.pageEl = pageEl;
      env.STATE.pageHost = host;
      env.STATE.pageHiddenRecords = [];
      pageHostService.PAGEHOST_isolateHeaderContext(env, env.STATE.pageSession);
      pageHostService.PAGEHOST_scheduleHeaderContextSync(env, env.STATE.pageSession);
      pageHostService.PAGEHOST_bindNativeNavigationGuards(env, env.STATE.pageSession);
      return true;
    },

    UI_mountInShellPage(env, pageEl) {
      return pageHostService.PAGEHOST_enterPage(env, pageEl);
    },
  };

  const uiShellService = {
    UI_makePanelIcon(env, svg, color, opts = {}) {
      const icon = env.D.createElement(typeof opts.onClick === 'function' ? 'button' : 'span');
      if (icon.tagName === 'BUTTON') {
        icon.type = 'button';
        icon.setAttribute('aria-label', opts.label || 'Edit appearance');
        icon.title = opts.label || 'Edit appearance';
        icon.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          opts.onClick?.(icon);
        };
      }
      icon.setAttribute(env.ATTR_CGXUI_STATE, 'panel-icon');
      icon.style.color = normalizeHexColor(env, color) || 'currentColor';
      icon.innerHTML = svg || env.FRAG_SVG_CATEGORY;
      return icon;
    },

    UI_makeViewerShell(env, titleText, subText, opts = {}) {
      const mode = normalizeCategoryMode(env, opts.mode);
      const box = env.D.createElement('div');
      box.setAttribute(env.ATTR_CGXUI, env.UI_FSECTION_VIEWER);
      box.setAttribute(env.ATTR_CGXUI_OWNER, env.SkID);
      box.setAttribute(env.ATTR_CGXUI_MODE, mode);

      const page = env.D.createElement('div');
      page.setAttribute(env.ATTR_CGXUI_STATE, 'page');

      const head = env.D.createElement('div');
      head.setAttribute(env.ATTR_CGXUI_STATE, 'head');

      const titleWrap = env.D.createElement('div');
      titleWrap.style.minWidth = '0';
      const ttl = env.D.createElement('div');
      ttl.setAttribute(env.ATTR_CGXUI_STATE, 'title');
      ttl.textContent = titleText;
      titleWrap.appendChild(ttl);

      if (subText) {
        const sub = env.D.createElement('div');
        sub.setAttribute(env.ATTR_CGXUI_STATE, 'sub');
        sub.textContent = subText;
        titleWrap.appendChild(sub);
      }

      const x = env.D.createElement('button');
      x.type = 'button';
      x.setAttribute(env.ATTR_CGXUI_STATE, 'close');
      x.setAttribute('aria-label', 'Close');
      x.textContent = '✕';
      x.onclick = () => pageHostService.UI_closeViewer(env);

      if (opts.iconSvg) head.appendChild(uiShellService.UI_makePanelIcon(env, opts.iconSvg, opts.iconColor, {
        label: opts.iconLabel,
        onClick: opts.onIconClick,
      }));
      head.appendChild(titleWrap);
      head.appendChild(x);

      const list = env.D.createElement('div');
      list.setAttribute(env.ATTR_CGXUI_STATE, 'list');

      page.appendChild(head);
      page.appendChild(list);
      box.appendChild(page);

      return { box, list };
    },

    UI_makeInShellPageShell(env, titleText, subText, tabText = 'Chats', opts = {}) {
      const page = env.D.createElement('div');
      page.setAttribute(env.ATTR_CGXUI, env.UI_FSECTION_PAGE);
      page.setAttribute(env.ATTR_CGXUI_OWNER, env.SkID);
      page.setAttribute('data-cgxui-page-kind', String(opts.kind || 'library'));
      page.setAttribute('data-cgxui-page-id', String(opts.id || ''));
      page.setAttribute('data-cgxui-page-title', String(titleText || 'Library'));
      page.className = '[--thread-content-max-width:40rem] @w-lg/main:[--thread-content-max-width:48rem] mx-auto max-w-(--thread-content-max-width) flex-1 grid h-full [width:min(90cqw,var(--thread-content-max-width))]';

      const top = env.D.createElement('div');
      top.setAttribute(env.ATTR_CGXUI_STATE, 'top');

      const head = env.D.createElement('div');
      head.setAttribute(env.ATTR_CGXUI_STATE, 'head');

      const titleWrap = env.D.createElement('div');
      titleWrap.style.minWidth = '0';

      const titleRow = env.D.createElement('div');
      titleRow.setAttribute(env.ATTR_CGXUI_STATE, 'title-row');

      const icon = env.D.createElement('div');
      icon.setAttribute(env.ATTR_CGXUI_STATE, 'title-icon');
      icon.style.color = normalizeHexColor(env, opts.iconColor) || 'currentColor';
      icon.innerHTML = opts.iconSvg || env.FRAG_SVG_CATEGORY;
      if (typeof opts.onIconClick === 'function') {
        icon.setAttribute('role', 'button');
        icon.setAttribute('tabindex', '0');
        icon.setAttribute('aria-label', opts.iconLabel || 'Edit appearance');
        icon.title = opts.iconLabel || 'Edit appearance';
        const fire = (e) => {
          e.preventDefault();
          e.stopPropagation();
          opts.onIconClick(icon);
        };
        icon.onclick = fire;
        icon.onkeydown = (e) => {
          if (e.key === 'Enter' || e.key === ' ') fire(e);
        };
      }

      const h1 = env.D.createElement('h1');
      h1.textContent = titleText;

      titleRow.appendChild(icon);
      titleRow.appendChild(h1);
      titleWrap.appendChild(titleRow);

      if (subText) {
        const sub = env.D.createElement('div');
        sub.setAttribute(env.ATTR_CGXUI_STATE, 'sub');
        sub.textContent = subText;
        titleWrap.appendChild(sub);
      }

      head.appendChild(titleWrap);

      const tabs = env.D.createElement('div');
      tabs.setAttribute(env.ATTR_CGXUI_STATE, 'tabs');
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', 'Category sections');

      const tab = env.D.createElement('button');
      tab.type = 'button';
      tab.setAttribute(env.ATTR_CGXUI_STATE, 'tab');
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', 'true');
      tab.textContent = tabText;
      tabs.appendChild(tab);

      const addViewAction = (label, route) => {
        const btn = env.D.createElement('button');
        btn.type = 'button';
        btn.setAttribute(env.ATTR_CGXUI_STATE, 'view-action');
        btn.textContent = label;
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          env.H2O.archiveBoot?.openWorkbench?.(route);
        };
        tabs.appendChild(btn);
      };
      addViewAction('Pinned', '#/pinned');
      addViewAction('Archive', '#/archive');
      // ENCAPSULATION SEAM: this branch injects a Projects-specific refresh button when kind='projects'.
      // env.UI_setProjectsRefreshButtonState and env.UI_handleProjectsManualRefresh are injected by
      // 0F2a via PROJECTS_ENV() — so LibraryCore does not hard-import Projects. However it does read
      // env.STATE.projectsManualRefreshRunning / projectsManualRefreshDoneUntil by name.
      // DO NOT add similar kind-specific branches for Tags, Labels, or other features.
      // Future feature owners should implement their own page-shell components instead.
      if (opts.kind === 'projects') {
        const refreshBtn = env.D.createElement('button');
        refreshBtn.type = 'button';
        refreshBtn.setAttribute(env.ATTR_CGXUI_STATE, 'view-action');
        refreshBtn.setAttribute('data-cgxui-projects-refresh', '1');
        const refreshState = env.STATE.projectsManualRefreshRunning ? 'loading' : Date.now() < env.STATE.projectsManualRefreshDoneUntil ? 'done' : 'idle';
        env.UI_setProjectsRefreshButtonState?.(refreshBtn, refreshState);
        if (refreshState === 'done') {
          const timer = env.W.setTimeout(() => {
            if (refreshBtn.isConnected && !env.STATE.projectsManualRefreshRunning) env.UI_setProjectsRefreshButtonState?.(refreshBtn, 'idle');
          }, Math.max(0, env.STATE.projectsManualRefreshDoneUntil - Date.now()));
          env.CLEAN.timers.add(timer);
        }
        refreshBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          env.UI_handleProjectsManualRefresh?.(refreshBtn);
        };
        tabs.appendChild(refreshBtn);
      }

      top.appendChild(head);
      top.appendChild(tabs);

      const list = env.D.createElement('ol');
      list.setAttribute(env.ATTR_CGXUI_STATE, 'list');
      list.setAttribute('aria-busy', 'false');

      page.appendChild(top);
      page.appendChild(list);

      return { page, list };
    },
  };


core.verifyOwnershipBoundaries = (() => {
  const splitPresence = (names, getter) => {
    const present = [];
    const missing = [];
    names.forEach((name) => {
      if (getter(name)) present.push(name);
      else missing.push(name);
    });
    return { missing, present };
  };
  const boolMap = (names, getter) => Object.fromEntries(names.map((name) => [name, !!getter(name)]));

  const required = {
    owners: splitPresence(boundarySpec.requiredOwners, (name) => core.getOwner?.(name)),
    services: splitPresence(boundarySpec.requiredServices, (name) => core.getService?.(name)),
    routes: splitPresence(boundarySpec.requiredRoutes, (name) => core.getRoute?.(name)),
  };
  const optional = {
    owners: splitPresence(boundarySpec.optionalOwners, (name) => core.getOwner?.(name)),
    services: splitPresence(boundarySpec.optionalServices, (name) => core.getService?.(name)),
    routes: splitPresence(boundarySpec.optionalRoutes, (name) => core.getRoute?.(name)),
  };
  const deferred = {
    routes: boundarySpec.deferredRoutes.slice(),
    missingRoutes: boundarySpec.deferredRoutes.filter((name) => !core.getRoute?.(name)),
    presentRoutes: boundarySpec.deferredRoutes.filter((name) => !!core.getRoute?.(name)),
  };
  const forbidden = {
    services: {
      present: boundarySpec.forbiddenServices.filter((name) => !!core.getService?.(name)),
      absent: boundarySpec.forbiddenServices.filter((name) => !core.getService?.(name)),
    },
  };
  const owners = boolMap(uniqueStrings(boundarySpec.requiredOwners, boundarySpec.optionalOwners), (name) => core.getOwner?.(name));
  const routes = boolMap(uniqueStrings(boundarySpec.requiredRoutes, boundarySpec.optionalRoutes, boundarySpec.deferredRoutes), (name) => core.getRoute?.(name));
  const services = boolMap(uniqueStrings(boundarySpec.requiredServices, boundarySpec.optionalServices, boundarySpec.forbiddenServices), (name) => core.getService?.(name));
  const compat = {
    'projects-compat': !!core.getService?.('projects-compat'),
    'categories-compat': !!core.getService?.('categories-compat'),
  };
  const missingOwners = required.owners.missing.slice();
  const missingRoutes = required.routes.missing.slice();
  const missingServices = required.services.missing.slice();

  return {
    ok: !missingOwners.length && !missingRoutes.length && !missingServices.length && !forbidden.services.present.length,
    required,
    optional,
    deferred,
    forbidden,
    counts: {
      owners: core.listOwners ? core.listOwners().length : 0,
      services: core.listServices ? core.listServices().length : 0,
      routes: core.listRoutes ? core.listRoutes().length : 0,
    },
    owners,
    routes,
    services,
    compat,
    missingOwners,
    missingRoutes,
    missingServices,
    guidance: [
      'projects-compat is architectural drift after final Projects extraction and must remain absent.',
      'categories-compat remains acceptable only as a narrow rendering-infra seam from 0F3a to 0F4a.',
      'Tags owns tag browsing APIs, but tags/tag route registration is intentionally deferred and must not fail boundary checks.',
      'Library Index remains read-only and consumes feature truth through public owners/services.',
    ],
  };
});

  core.compat = core.compat || {};
  core.compat.phase6FinalSplitActive = true;
  core.compat.phase7HardenedTemplateBase = true;
  core.compat.phase8LibraryBoundaryDiagnostics = true;
  core.compat.notes = [
    'Phase 2: extracted shared route/page-host/ui-shell into Library Core services.',
    'Phase 6: made route registry authoritative; removed projects-compat; extracted 0F2a and 0F4a.',
    'Phase 7: hardening + documentation pass; this split is now the canonical template base for Tags, Labels, Studio, and other future library modules.',
    'Phase 8: boundary diagnostics reflect Library Workspace, Index, Insights, Projects, Folders, Categories, Tags, and Labels; tags/tag routes remain deferred.',
    'No storage-key migration was part of phases 6 or 7.',
    'Public H2O.folders surface remains stable and must not be broken by future module additions.',
  ];

  core.selfCheck = (() => {
    const boundaries = core.verifyOwnershipBoundaries ? core.verifyOwnershipBoundaries() : null;
    const owners = core.listOwners ? core.listOwners() : [];
    const routes = core.listRoutes ? core.listRoutes() : [];
    const pages = core.listPages ? core.listPages() : [];
    const services = core.listServices ? core.listServices() : [];
    return {
      ok: !!boundaries?.ok,
      owner: core.meta.owner,
      phase: core.meta.phase,
      counts: {
        owners: owners.length,
        services: services.length,
        routes: routes.length,
        pages: pages.length,
      },
      ownerCount: owners.length,
      serviceCount: services.length,
      routeCount: routes.length,
      owners,
      routes,
      pages,
      services,
      missingOwners: boundaries?.missingOwners || [],
      missingRoutes: boundaries?.missingRoutes || [],
      missingServices: boundaries?.missingServices || [],
      compat: boundaries?.compat || null,
      boundaries,
    };
  });

  try { core.registerOwner('library-core', { meta: core.meta, phase: core.phase, contracts: core.contracts, compat: core.compat, selfCheck: core.selfCheck }, { replace: true }); } catch (e) { err('registerOwner:library-core', e); }
  try { core.registerService('route', routeService, { replace: true }); } catch (e) { err('registerService:route', e); }
  try { core.registerService('page-host', pageHostService, { replace: true }); } catch (e) { err('registerService:page-host', e); }
  try { core.registerService('ui-shell', uiShellService, { replace: true }); } catch (e) { err('registerService:ui-shell', e); }
  try { core.registerService('native-sidebar', nativeSidebarService, { replace: true }); } catch (e) { err('registerService:native-sidebar', e); }

  step('boot', core.meta.phase);
})();
