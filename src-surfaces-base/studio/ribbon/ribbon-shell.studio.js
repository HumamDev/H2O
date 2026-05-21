/* H2O Studio — Ribbon Shell (Phase 1a)
 *
 * Publishes H2O.Studio.ribbon — a passive registry of tabs / groups / actions,
 * plus a chat-type context tracker and Studio-local UI state (active tab,
 * collapsed) persisted via H2O.Studio.store.prefs.
 *
 * Phase 1a scope:
 *   - registerTab / registerGroup / registerAction (passive registries)
 *   - setContext({ route, chatType, snapshotId, chatId, readOnly })
 *     -> recorded; emits contextChanged
 *   - setActiveTab(id) / getActiveTab()       -> persists via prefs
 *   - setCollapsed(bool) / getCollapsed()     -> persists via prefs
 *   - mount(container) / unmount()            -> NO-OP STUBS (surface module
 *                                                S0Y1a owns DOM)
 *   - state, events, getState, selfCheck
 *
 * Explicit non-goals (Phase 1a):
 *   - no DOM mount of any kind from this file
 *   - no action handler execution (handlers may be registered, never invoked)
 *   - no mutation of chat / snapshot / folder / metadata data
 *   - no chrome.* / localStorage / indexedDB / fetch
 *   - no MutationObserver, no cg* selectors, no chatgpt.com references
 *
 * Boot hydration mirrors the dock-shell pattern: sync read on install,
 * re-read on prefs 'ready' event for async-hydrated adapters; writes during
 * hydration are suppressed so persisted values do not loop back into prefs.
 *
 * Depends on:
 *   - H2O global (H2O Core)
 *   - H2O.Studio.RibbonKeys / RibbonEvents / RibbonTabIds / RibbonChatTypes
 *     (from ribbon-keys.js, loaded earlier)
 *   - Optional: H2O.events.emit
 *   - Optional: H2O.Studio.store.prefs
 *
 * Does NOT depend on:
 *   - any DOM element in studio.html
 *   - any other Studio feature module
 *   - the dock shell (independent UI region)
 */
(function (global) {
  'use strict';

  const H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  /* Idempotency guard. */
  if (H2O.Studio.ribbon && H2O.Studio.ribbon.__shellInstalled) {
    return;
  }

  const VERSION = '0.1.0-phase-1a';
  const PHASE = '1a';

  /* ── Constants from ribbon-keys.js (defensive defaults if absent) ── */
  const RibbonKeys = (H2O.Studio.RibbonKeys) || Object.freeze({
    activeTab: 'h2o:studio:ribbon:active-tab:v1',
    collapsed: 'h2o:studio:ribbon:collapsed:v1',
  });

  const RibbonEvents = (H2O.Studio.RibbonEvents) || Object.freeze({
    ready:            'evt:h2o:studio:ribbon:ready',
    contextChanged:   'evt:h2o:studio:ribbon:context-changed',
    tabChanged:       'evt:h2o:studio:ribbon:tab-changed',
    actionInvoked:    'evt:h2o:studio:ribbon:action-invoked',
    collapsedChanged: 'evt:h2o:studio:ribbon:collapsed-changed',
    tabRegistered:    'evt:h2o:studio:ribbon:tab-registered',
  });

  /* Allowed chatType values — null means "no chat context, ribbon hidden". */
  const CHAT_TYPES = new Set(['saved', 'indexed', 'imported', 'readonly']);

  /* ── Internal state ───────────────────────────────────────────────── */
  /* Registries: tab id -> tab def; tab id -> (group id -> group def);
   * tab id -> (group id -> (action id -> action def)). */
  const tabsRegistry = Object.create(null);
  const groupsRegistry = Object.create(null);
  const actionsRegistry = Object.create(null);

  const internalState = {
    activeTab: null,
    collapsed: false,
    mounted: false,
    mountContainer: null,
    context: {
      route: null,
      chatType: null,
      snapshotId: null,
      chatId: null,
      /* Phase 1b — title for Copy title action; originalUrl for
       * Open original action. Both nullable. */
      title: null,
      originalUrl: null,
      readOnly: false,
    },
  };

  const errors = [];
  const errMax = 20;
  let prefsUnsub = null;
  let suppressPersist = false;

  /* When platform-storage hydration delivers an activeTab id but the
   * surface module (S0Y1a) hasn't registered that tab yet, stash the value
   * here. registerTab() consumes it the moment the matching tab id arrives.
   * Without this, the persisted activeTab is silently lost on cold reload
   * because hydration runs before S0Y1a's registerCatalogue(). undefined =
   * no pending value, string = pending tab id. */
  let pendingActiveTab = undefined;

  /* ── Direct subscribers (independent of H2O.events) ────────────────
   * H2O.events in the current Studio runtime exposes emit but not on, so
   * surface modules cannot reliably subscribe via the global bus. This
   * shell owns its own subscriber set; consumers (S0Y1a) call subscribe()
   * directly. softEmit still attempts H2O.events.emit for any external
   * listeners that may exist, but the subscriber notification path is the
   * canonical channel for in-process listeners. */
  const subscribers = new Set();
  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    subscribers.add(fn);
    return function unsubscribe() { subscribers.delete(fn); };
  }
  function notifySubscribers(eventName, detail) {
    subscribers.forEach(function (fn) {
      try { fn({ event: eventName, detail: detail || {} }); }
      catch (e) { recordError('subscriber:' + eventName, e); }
    });
  }

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }
  function isNonEmptyString(v) {
    return typeof v === 'string' && v.length > 0;
  }
  function recordError(op, e) {
    try {
      const message = String((e && e.message) || (e && e.stack) || e || '');
      errors.push({ t: Date.now(), op: String(op), e: message });
      if (errors.length > errMax) errors.splice(0, errors.length - errMax);
    } catch (_) { /* swallow */ }
  }
  function softEmit(eventName, detail) {
    try {
      const events = H2O && H2O.events;
      if (events && typeof events.emit === 'function') {
        events.emit(eventName, detail || {});
      }
    } catch (e) {
      recordError('emit:' + eventName, e);
    }
    /* Always notify direct subscribers — this is the canonical channel
     * because H2O.events in the current Studio runtime is emit-only. */
    notifySubscribers(eventName, detail);
  }
  function getPrefs() {
    try {
      const p = H2O.Studio && H2O.Studio.store && H2O.Studio.store.prefs;
      if (p && typeof p.get === 'function' && typeof p.set === 'function') return p;
    } catch (_) { /* swallow */ }
    return null;
  }
  function persistActiveTab(value) {
    if (suppressPersist) return;
    const prefs = getPrefs();
    if (!prefs) return;
    try { prefs.set(RibbonKeys.activeTab, value === null ? null : String(value)); }
    catch (e) { recordError('persistActiveTab', e); }
  }
  function persistCollapsed(value) {
    if (suppressPersist) return;
    const prefs = getPrefs();
    if (!prefs) return;
    try { prefs.set(RibbonKeys.collapsed, !!value); }
    catch (e) { recordError('persistCollapsed', e); }
  }

  /* ── Tab / group / action registries ──────────────────────────────── */
  function registerTab(id, def) {
    if (!isNonEmptyString(id)) return;
    if (!isPlainObject(def)) return;
    const stored = Object.assign({}, def, { id: id });
    tabsRegistry[id] = stored;
    if (!groupsRegistry[id]) groupsRegistry[id] = Object.create(null);
    if (!actionsRegistry[id]) actionsRegistry[id] = Object.create(null);
    softEmit(RibbonEvents.tabRegistered, { id: id });
    /* If platform-storage hydration earlier stashed this tab id as the
     * persisted active tab, apply it now that the tab is registered. */
    if (pendingActiveTab === id) {
      suppressPersist = true;
      try {
        const prev = internalState.activeTab;
        if (prev !== id) {
          internalState.activeTab = id;
          softEmit(RibbonEvents.tabChanged, { tab: id, previous: prev, source: 'register-tab-hydrate' });
        }
      } finally {
        pendingActiveTab = undefined;
        suppressPersist = false;
      }
    }
  }
  function getTab(id) {
    if (!isNonEmptyString(id)) return null;
    return tabsRegistry[id] || null;
  }
  function tabs() {
    return Object.assign({}, tabsRegistry);
  }
  function tabCount() {
    return Object.keys(tabsRegistry).length;
  }
  function registerGroup(tabId, groupId, def) {
    if (!isNonEmptyString(tabId) || !isNonEmptyString(groupId)) return;
    if (!isPlainObject(def)) return;
    if (!tabsRegistry[tabId]) return;
    if (!groupsRegistry[tabId]) groupsRegistry[tabId] = Object.create(null);
    if (!actionsRegistry[tabId]) actionsRegistry[tabId] = Object.create(null);
    groupsRegistry[tabId][groupId] = Object.assign({}, def, { id: groupId });
    if (!actionsRegistry[tabId][groupId]) actionsRegistry[tabId][groupId] = Object.create(null);
  }
  function groupsForTab(tabId) {
    if (!isNonEmptyString(tabId)) return {};
    return Object.assign({}, groupsRegistry[tabId] || {});
  }
  function registerAction(tabId, groupId, actionId, def) {
    if (!isNonEmptyString(tabId) || !isNonEmptyString(groupId) || !isNonEmptyString(actionId)) return;
    if (!isPlainObject(def)) return;
    if (!tabsRegistry[tabId]) return;
    if (!groupsRegistry[tabId] || !groupsRegistry[tabId][groupId]) return;
    if (!actionsRegistry[tabId]) actionsRegistry[tabId] = Object.create(null);
    if (!actionsRegistry[tabId][groupId]) actionsRegistry[tabId][groupId] = Object.create(null);
    actionsRegistry[tabId][groupId][actionId] = Object.assign({}, def, { id: actionId });
  }
  function actionsForGroup(tabId, groupId) {
    if (!isNonEmptyString(tabId) || !isNonEmptyString(groupId)) return {};
    const t = actionsRegistry[tabId];
    if (!t) return {};
    return Object.assign({}, t[groupId] || {});
  }

  /* ── No-op mount stubs (S0Y1a owns DOM) ───────────────────────────── */
  function mount(container) {
    internalState.mountContainer = container || null;
    internalState.mounted = true;
    softEmit(RibbonEvents.ready, {});
  }
  function unmount() {
    internalState.mountContainer = null;
    internalState.mounted = false;
  }

  /* ── Active tab ───────────────────────────────────────────────────── */
  function setActiveTab(id) {
    if (id === null) {
      if (internalState.activeTab === null) return true;
      const prev = internalState.activeTab;
      internalState.activeTab = null;
      persistActiveTab(null);
      softEmit(RibbonEvents.tabChanged, { tab: null, previous: prev });
      return true;
    }
    if (!isNonEmptyString(id)) return false;
    if (!Object.prototype.hasOwnProperty.call(tabsRegistry, id)) return false;
    if (internalState.activeTab === id) return true;
    const prev = internalState.activeTab;
    internalState.activeTab = id;
    persistActiveTab(id);
    softEmit(RibbonEvents.tabChanged, { tab: id, previous: prev });
    return true;
  }
  function getActiveTab() {
    return internalState.activeTab;
  }

  /* ── Collapsed ────────────────────────────────────────────────────── */
  function setCollapsed(value) {
    const next = !!value;
    if (internalState.collapsed === next) return;
    internalState.collapsed = next;
    persistCollapsed(next);
    softEmit(RibbonEvents.collapsedChanged, { collapsed: next });
  }
  function getCollapsed() {
    return internalState.collapsed;
  }

  /* ── Context (chat type / route) ──────────────────────────────────── */
  function setContext(ctx) {
    const safe = isPlainObject(ctx) ? ctx : {};
    const route = isNonEmptyString(safe.route) ? safe.route : null;
    const chatType = (typeof safe.chatType === 'string' && CHAT_TYPES.has(safe.chatType))
      ? safe.chatType
      : null;
    const snapshotId = isNonEmptyString(safe.snapshotId) ? safe.snapshotId : null;
    const chatId = isNonEmptyString(safe.chatId) ? safe.chatId : null;
    /* Phase 1b — title + originalUrl. Both default to null. */
    const title = isNonEmptyString(safe.title) ? safe.title : null;
    const originalUrl = isNonEmptyString(safe.originalUrl) ? safe.originalUrl : null;
    const readOnly = !!safe.readOnly;

    const prev = Object.assign({}, internalState.context);
    const next = {
      route: route,
      chatType: chatType,
      snapshotId: snapshotId,
      chatId: chatId,
      title: title,
      originalUrl: originalUrl,
      readOnly: readOnly,
    };

    const unchanged =
      prev.route === next.route &&
      prev.chatType === next.chatType &&
      prev.snapshotId === next.snapshotId &&
      prev.chatId === next.chatId &&
      prev.title === next.title &&
      prev.originalUrl === next.originalUrl &&
      prev.readOnly === next.readOnly;
    if (unchanged) return;

    internalState.context = next;
    softEmit(RibbonEvents.contextChanged, { context: Object.assign({}, next), previous: prev });
  }
  function getContext() {
    return Object.assign({}, internalState.context);
  }

  /* ── Read-only state view ─────────────────────────────────────────── */
  const stateView = {};
  Object.defineProperty(stateView, 'activeTab',  { get: function () { return internalState.activeTab; },  enumerable: true });
  Object.defineProperty(stateView, 'collapsed',  { get: function () { return internalState.collapsed; },  enumerable: true });
  Object.defineProperty(stateView, 'mounted',    { get: function () { return internalState.mounted; },    enumerable: true });
  Object.defineProperty(stateView, 'context',    { get: function () { return Object.assign({}, internalState.context); }, enumerable: true });
  Object.freeze(stateView);

  /* ── Status helpers ───────────────────────────────────────────────── */
  function isPersisted() {
    const prefs = getPrefs();
    if (!prefs) return false;
    try {
      const sc = typeof prefs.selfCheck === 'function' ? prefs.selfCheck() : null;
      return !!(sc && sc.hasPlatformStorage);
    } catch (_) { return false; }
  }
  function getState() {
    return {
      activeTab: internalState.activeTab,
      collapsed: internalState.collapsed,
      mounted: internalState.mounted,
      context: Object.assign({}, internalState.context),
      tabCount: tabCount(),
      phase: PHASE,
      version: VERSION,
      persisted: isPersisted(),
    };
  }
  function selfCheck() {
    const prefs = getPrefs();
    let hasPlatformStorage = false;
    try {
      const p = H2O && H2O.Studio && H2O.Studio.platform;
      hasPlatformStorage = !!(p && p.storage && typeof p.storage.get === 'function');
    } catch (_) { hasPlatformStorage = false; }
    return {
      ok: errors.length === 0,
      version: VERSION,
      phase: PHASE,
      hasRibbonKeys: !!(H2O.Studio && H2O.Studio.RibbonKeys),
      hasRibbonEvents: !!(H2O.Studio && H2O.Studio.RibbonEvents),
      hasPrefsStore: !!prefs,
      hasPlatformStorage: hasPlatformStorage,
      persisted: isPersisted(),
      tabCount: tabCount(),
      activeTab: internalState.activeTab,
      pendingActiveTab: pendingActiveTab === undefined ? null : pendingActiveTab,
      collapsed: internalState.collapsed,
      mounted: internalState.mounted,
      context: Object.assign({}, internalState.context),
      errors: errors.slice(),
    };
  }

  /* ── Boot hydration (sync + async via prefs ready event) ──────────── */
  function hydrateFromPrefs(reason) {
    const prefs = getPrefs();
    if (!prefs) return;
    suppressPersist = true;
    try {
      const persistedTab = prefs.get(RibbonKeys.activeTab, undefined);
      if (persistedTab === null || typeof persistedTab === 'string') {
        if (persistedTab !== internalState.activeTab) {
          if (persistedTab === null) {
            const prev = internalState.activeTab;
            internalState.activeTab = null;
            softEmit(RibbonEvents.tabChanged, { tab: null, previous: prev, source: reason || 'hydrate' });
          } else if (Object.prototype.hasOwnProperty.call(tabsRegistry, persistedTab)) {
            const prev = internalState.activeTab;
            internalState.activeTab = persistedTab;
            softEmit(RibbonEvents.tabChanged, { tab: persistedTab, previous: prev, source: reason || 'hydrate' });
          }
          /* Non-registered tab id: leave state alone — surface module may
           * register it later and re-hydrate via its own boot path. */
        }
      }
      const persistedCollapsed = prefs.get(RibbonKeys.collapsed, undefined);
      if (typeof persistedCollapsed === 'boolean' && persistedCollapsed !== internalState.collapsed) {
        internalState.collapsed = persistedCollapsed;
        softEmit(RibbonEvents.collapsedChanged, { collapsed: persistedCollapsed, source: reason || 'hydrate' });
      }
    } catch (e) {
      recordError('hydrate', e);
    }
    suppressPersist = false;
  }
  /* Hydrate ribbon UI state directly from H2O.Studio.platform.storage.
   *
   * Why this exists: prefs.js's bootHydrate is intentionally Dock-scoped
   * (commit db3a152). Its keysToLoad list pre-populates only dock keys
   * into the prefs cache, so prefs.get('h2o:studio:ribbon:active-tab:v1')
   * returns undefined on cold boot. To restore ribbon activeTab and
   * collapsed across reloads, we read the two ribbon keys directly through
   * the platform adapter — the same backing store prefs uses, just bypassing
   * its bootHydrate phase. Writes still flow through prefs.set so the cache
   * stays consistent with persisted state.
   *
   * Storage-rule note: H2O.Studio.platform.storage IS the canonical Studio
   * storage surface (per STUDIO_PLATFORM_ADAPTER_GUIDE.md). This is not a
   * bypass of chrome.* / localStorage / indexedDB — those remain forbidden.
   */
  function hydrateFromPlatformStorage(reason) {
    let platform;
    try {
      platform = H2O && H2O.Studio && H2O.Studio.platform;
    } catch (_) { platform = null; }
    const storage = platform && platform.storage;
    if (!storage || typeof storage.get !== 'function') return;

    function applyActiveTab(value) {
      if (value === undefined) return;
      suppressPersist = true;
      try {
        if (value === null) {
          if (internalState.activeTab !== null) {
            const prev = internalState.activeTab;
            internalState.activeTab = null;
            pendingActiveTab = undefined;
            softEmit(RibbonEvents.tabChanged, { tab: null, previous: prev, source: reason || 'platform-hydrate' });
          }
        } else if (typeof value === 'string' && value !== '') {
          if (Object.prototype.hasOwnProperty.call(tabsRegistry, value)) {
            if (internalState.activeTab !== value) {
              const prev = internalState.activeTab;
              internalState.activeTab = value;
              pendingActiveTab = undefined;
              softEmit(RibbonEvents.tabChanged, { tab: value, previous: prev, source: reason || 'platform-hydrate' });
            }
          } else {
            /* Tab not registered yet — surface module hasn't run
             * registerCatalogue. Stash for registerTab to apply later. */
            pendingActiveTab = value;
          }
        }
      } catch (e) { recordError('hydratePlatform:activeTab:apply', e); }
      suppressPersist = false;
    }

    function applyCollapsed(value) {
      if (value === undefined || value === null) return;
      suppressPersist = true;
      try {
        if (typeof value === 'boolean' && value !== internalState.collapsed) {
          internalState.collapsed = value;
          softEmit(RibbonEvents.collapsedChanged, { collapsed: value, source: reason || 'platform-hydrate' });
        }
      } catch (e) { recordError('hydratePlatform:collapsed:apply', e); }
      suppressPersist = false;
    }

    try {
      const r1 = storage.get(RibbonKeys.activeTab);
      if (r1 && typeof r1.then === 'function') {
        r1.then(applyActiveTab, function (e) { recordError('hydratePlatform:activeTab:get', e); });
      } else {
        applyActiveTab(r1);
      }
    } catch (e) { recordError('hydratePlatform:activeTab:invoke', e); }

    try {
      const r2 = storage.get(RibbonKeys.collapsed);
      if (r2 && typeof r2.then === 'function') {
        r2.then(applyCollapsed, function (e) { recordError('hydratePlatform:collapsed:get', e); });
      } else {
        applyCollapsed(r2);
      }
    } catch (e) { recordError('hydratePlatform:collapsed:invoke', e); }
  }

  function bindPrefs() {
    const prefs = getPrefs();
    if (!prefs) {
      recordError('bindPrefs:missing', new Error('H2O.Studio.store.prefs not available'));
      /* Even without the prefs store wrapper, attempt platform-storage
       * hydration so ribbon state still restores from the underlying
       * adapter in real MV3 / Tauri runtimes. */
      hydrateFromPlatformStorage('boot-no-prefs');
      return;
    }
    hydrateFromPrefs('boot-sync');
    hydrateFromPlatformStorage('boot-sync');
    try {
      prefsUnsub = prefs.subscribe(function (evt) {
        if (!evt) return;
        if (evt.type === 'ready') {
          hydrateFromPrefs('boot-async');
          /* Re-hydrate ribbon keys too — in async-prefs runtimes (real
           * MV3 / Tauri) the platform storage may have settled by now. */
          hydrateFromPlatformStorage('boot-async');
        }
      });
    } catch (e) {
      recordError('bindPrefs:subscribe', e);
    }
  }

  /* ── Assemble the public namespace ────────────────────────────────── */
  const ribbonApi = {
    version: VERSION,
    phase: PHASE,
    registerTab: registerTab,
    getTab: getTab,
    registerGroup: registerGroup,
    groupsForTab: groupsForTab,
    registerAction: registerAction,
    actionsForGroup: actionsForGroup,
    mount: mount,
    unmount: unmount,
    setActiveTab: setActiveTab,
    getActiveTab: getActiveTab,
    setCollapsed: setCollapsed,
    getCollapsed: getCollapsed,
    setContext: setContext,
    getContext: getContext,
    subscribe: subscribe,
    /* Public hydrate() — re-reads activeTab + collapsed from prefs cache
     * and H2O.Studio.platform.storage and applies any persisted values.
     *
     * Why this is public: when a real platform adapter (MV3 / Tauri) is
     * bound AFTER ribbon-shell installs (e.g. delayed adapter registration
     * or test harness), the boot-time hydration may have run against the
     * fallback adapter and applied nothing. Calling hydrate() at any time
     * is safe and idempotent: it never overwrites a non-persisted value
     * with null (each apply function checks for matching type / non-null).
     * suppressPersist guards prevent the hydrated value from echoing back
     * to storage. */
    hydrate: function () {
      hydrateFromPrefs('manual');
      hydrateFromPlatformStorage('manual');
    },
    getState: getState,
    selfCheck: selfCheck,
    state: stateView,
    events: RibbonEvents,
    __shellInstalled: true,
    __phase: PHASE,
  };
  Object.defineProperty(ribbonApi, 'tabs', { get: tabs, enumerable: true });

  H2O.Studio.ribbon = ribbonApi;

  bindPrefs();
})(globalThis);
