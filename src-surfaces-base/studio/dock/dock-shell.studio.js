/* H2O Studio — Dock Shell (Phase 1b)
 *
 * Publishes H2O.Studio.dock — a passive, mountless tab registry plus
 * Studio-local UI state (open / view) persisted via
 * H2O.Studio.store.prefs.
 *
 * Phase 1a introduced the namespace and no-op methods; Phase 1b wires
 * persistence for the Dock open flag and active view id. This file
 * still does NOT:
 *   - mount any DOM (mount/unmount remain no-op stubs)
 *   - render any tab (registered tabs are tracked, never painted)
 *   - reach into any feature engine, native runtime, or studio reader
 *   - write any non-Studio key (refused at the prefs store boundary)
 *
 * Persistence rules:
 *   - open: persisted under H2O.Studio.store.prefs.keys.dockOpen
 *           ('h2o:studio:dock:open:v1') as a boolean
 *   - view: persisted under H2O.Studio.store.prefs.keys.dockView
 *           ('h2o:studio:dock:view:v1') as a string id or null
 *   - mounted / tabsRegistry: in-memory only; never persisted
 *
 * Public API (Phase 1b):
 *   version: '0.1.0-phase-1b'
 *   phase: '1b'
 *   registerTab(id, def): void
 *   getTab(id): TabDef | null
 *   unregisterTab(id): boolean
 *   tabs: { [id]: TabDef }                  // fresh shallow copy on read
 *   mount(container): void                  // no-op stub
 *   unmount(): void                         // no-op stub
 *   open(): void                            // persists dockOpen
 *   close(): void                           // persists dockOpen
 *   toggle(): void
 *   setView(id): boolean                    // null clears; unknown id rejected
 *   getView(): string | null
 *   state: { open, view, mounted }          // read-only getter view
 *   events: { ready, viewChanged,
 *             openChanged, tabRegistered }  // frozen event-name constants
 *   getState(): { open, view, mounted,
 *                 tabCount, phase, version,
 *                 persisted }
 *   selfCheck(): { ok, version, phase,
 *                  hasDockKeys, hasDockEvents,
 *                  hasPrefsStore, persisted,
 *                  tabCount, open, view, mounted,
 *                  errors }
 *
 * Boot hydration:
 *   1. Sync hydrate at install time: read prefs.get(dockOpen, undefined)
 *      and prefs.get(dockView, undefined). If the prefs cache is still
 *      cold (no real platform adapter, or async load not yet done) these
 *      return undefined and state stays at defaults.
 *   2. Subscribe to prefs; when the 'ready' event fires (async hydration
 *      complete) re-read both keys and update state, emitting
 *      openChanged / viewChanged for any actual change. Writes performed
 *      during boot hydration are suppressed so we never loop a hydrated
 *      value back into prefs.
 *   3. setView only applies a hydrated view id if a tab with that id is
 *      currently registered. Unregistered hydrated ids are silently
 *      ignored to avoid showing a "ghost view" pointing at a tab that
 *      will never paint.
 *
 * Contracts:
 *   docs/contracts/studio-dock-tab-registration.md
 *   docs/architecture/studio-dock-panel-plan.md
 *   src-surfaces-base/studio/STUDIO_DOCK_PANEL_CONTRACT.md
 *   src-surfaces-base/studio/dock/README.md
 *
 * Depends on:
 *   - H2O global (created by H2O Core, loaded earlier in studio.html)
 *   - Optional: H2O.events.emit (used if present; soft-fails otherwise)
 *   - Optional: H2O.Studio.store.prefs (used if present; soft-fails)
 *
 * Does NOT depend on:
 *   - chrome.* / localStorage / IndexedDB
 *   - any DOM element in studio.html
 *   - any other Studio feature module
 */
(function (global) {
  'use strict';

  const H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  /* Idempotency guard — script may be re-included during dev hot reload. */
  if (H2O.Studio.dock && H2O.Studio.dock.__shellInstalled) {
    return;
  }

  const VERSION = '0.1.0-phase-1b';
  const PHASE = '1b';

  /* ── Event-name constants (Studio-local; do not collide with native) ── */
  const DOCK_SHELL_EVENTS = Object.freeze({
    ready:         'h2o:studio:dock:ready',
    viewChanged:   'h2o:studio:dock:view-changed',
    openChanged:   'h2o:studio:dock:open-changed',
    tabRegistered: 'h2o:studio:dock:tab-registered',
  });

  /* ── Internal state (open/view also persisted via prefs) ──────────── */
  const tabsRegistry = Object.create(null);
  const internalState = {
    open: false,
    view: null,
    mounted: false,
    mountContainer: null,
  };

  const errors = [];
  const errMax = 20;
  let prefsUnsub = null;
  let suppressPersist = false;   /* true while hydrating from prefs */

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
      if (errors.length > errMax) {
        errors.splice(0, errors.length - errMax);
      }
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
  }
  function getPrefs() {
    try {
      const p = H2O.Studio && H2O.Studio.store && H2O.Studio.store.prefs;
      if (p && typeof p.get === 'function' && typeof p.set === 'function') {
        return p;
      }
    } catch (_) { /* swallow */ }
    return null;
  }
  function persistOpen(value) {
    if (suppressPersist) return;
    const prefs = getPrefs();
    if (!prefs) return;
    try { prefs.set(prefs.keys.dockOpen, !!value); }
    catch (e) { recordError('persistOpen', e); }
  }
  function persistView(value) {
    if (suppressPersist) return;
    const prefs = getPrefs();
    if (!prefs) return;
    try { prefs.set(prefs.keys.dockView, value === null ? null : String(value)); }
    catch (e) { recordError('persistView', e); }
  }

  /* ── Tab registry ─────────────────────────────────────────────────── */
  function registerTab(id, def) {
    if (!isNonEmptyString(id)) return;
    if (!isPlainObject(def)) return;
    /* Phase 1a/1b accept whatever def the caller provides; required-field
     * validation (render, title) is the host's job in later phases. We
     * only enforce a usable id key for lookup. */
    const stored = Object.assign({}, def, { id: id });
    tabsRegistry[id] = stored;
    softEmit(DOCK_SHELL_EVENTS.tabRegistered, { id: id });
  }
  function getTab(id) {
    if (!isNonEmptyString(id)) return null;
    return tabsRegistry[id] || null;
  }
  function unregisterTab(id) {
    if (!isNonEmptyString(id)) return false;
    if (!Object.prototype.hasOwnProperty.call(tabsRegistry, id)) return false;
    delete tabsRegistry[id];
    /* If the active view was this tab, clear it and persist null. */
    if (internalState.view === id) {
      const oldView = internalState.view;
      internalState.view = null;
      persistView(null);
      softEmit(DOCK_SHELL_EVENTS.viewChanged, { view: null, previous: oldView });
    }
    return true;
  }
  function tabsView() {
    return Object.assign({}, tabsRegistry);
  }
  function tabCount() {
    return Object.keys(tabsRegistry).length;
  }

  /* ── No-op shell methods (unchanged from 1a) ──────────────────────── */
  function mount(container) {
    internalState.mountContainer = container || null;
    internalState.mounted = true;
    softEmit(DOCK_SHELL_EVENTS.ready, {});
  }
  function unmount() {
    internalState.mountContainer = null;
    internalState.mounted = false;
  }

  /* ── Open / close / toggle (now persist via prefs) ────────────────── */
  function open() {
    if (internalState.open) return;
    internalState.open = true;
    persistOpen(true);
    softEmit(DOCK_SHELL_EVENTS.openChanged, { open: true });
  }
  function close() {
    if (!internalState.open) return;
    internalState.open = false;
    persistOpen(false);
    softEmit(DOCK_SHELL_EVENTS.openChanged, { open: false });
  }
  function toggle() {
    if (internalState.open) close();
    else open();
  }

  /* ── setView (boolean return; null clears; unknown id rejected) ───── */
  function setView(id) {
    /* null is the explicit "no active view" value; persist it. */
    if (id === null) {
      if (internalState.view === null) return true;
      const oldView = internalState.view;
      internalState.view = null;
      persistView(null);
      softEmit(DOCK_SHELL_EVENTS.viewChanged, { view: null, previous: oldView });
      return true;
    }
    if (!isNonEmptyString(id)) return false;
    /* Reject unregistered tab ids (does not persist). */
    if (!Object.prototype.hasOwnProperty.call(tabsRegistry, id)) return false;
    if (internalState.view === id) return true;
    const oldView = internalState.view;
    internalState.view = id;
    persistView(id);
    softEmit(DOCK_SHELL_EVENTS.viewChanged, { view: id, previous: oldView });
    return true;
  }
  function getView() {
    return internalState.view;
  }

  /* ── Read-only state view ─────────────────────────────────────────── */
  const stateView = {};
  Object.defineProperty(stateView, 'open', {
    get: function () { return internalState.open; },
    enumerable: true,
  });
  Object.defineProperty(stateView, 'view', {
    get: function () { return internalState.view; },
    enumerable: true,
  });
  Object.defineProperty(stateView, 'mounted', {
    get: function () { return internalState.mounted; },
    enumerable: true,
  });
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
      open: internalState.open,
      view: internalState.view,
      mounted: internalState.mounted,
      tabCount: tabCount(),
      phase: PHASE,
      version: VERSION,
      persisted: isPersisted(),
    };
  }
  function selfCheck() {
    const prefs = getPrefs();
    return {
      ok: errors.length === 0,
      version: VERSION,
      phase: PHASE,
      hasDockKeys: !!(H2O.Studio && H2O.Studio.DockKeys),
      hasDockEvents: !!(H2O.Studio && H2O.Studio.DockEvents),
      hasPrefsStore: !!prefs,
      persisted: isPersisted(),
      tabCount: tabCount(),
      open: internalState.open,
      view: internalState.view,
      mounted: internalState.mounted,
      errors: errors.slice(),
    };
  }

  /* ── Boot hydration (sync + async via prefs ready event) ──────────── */
  function hydrateFromPrefs(reason) {
    const prefs = getPrefs();
    if (!prefs) return;
    suppressPersist = true;
    try {
      const persistedOpen = prefs.get(prefs.keys.dockOpen, undefined);
      if (typeof persistedOpen === 'boolean' && persistedOpen !== internalState.open) {
        const wasOpen = internalState.open;
        internalState.open = persistedOpen;
        softEmit(DOCK_SHELL_EVENTS.openChanged, { open: persistedOpen, previous: wasOpen, source: reason || 'hydrate' });
      }
      const persistedView = prefs.get(prefs.keys.dockView, undefined);
      if (persistedView === null || typeof persistedView === 'string') {
        if (persistedView !== internalState.view) {
          /* Only apply a hydrated view id when null OR when the
           * referenced tab is currently registered. */
          if (persistedView === null) {
            const oldView = internalState.view;
            internalState.view = null;
            softEmit(DOCK_SHELL_EVENTS.viewChanged, { view: null, previous: oldView, source: reason || 'hydrate' });
          } else if (Object.prototype.hasOwnProperty.call(tabsRegistry, persistedView)) {
            const oldView = internalState.view;
            internalState.view = persistedView;
            softEmit(DOCK_SHELL_EVENTS.viewChanged, { view: persistedView, previous: oldView, source: reason || 'hydrate' });
          }
          /* If persistedView is a non-registered string, leave state
           * alone and do NOT clear — we just can't safely apply it. */
        }
      }
    } catch (e) {
      recordError('hydrate', e);
    }
    suppressPersist = false;
  }

  function bindPrefs() {
    const prefs = getPrefs();
    if (!prefs) {
      /* Non-fatal: log once, but never throw. selfCheck reports
       * hasPrefsStore=false and persisted=false; in-memory defaults
       * stay in effect. */
      recordError('bindPrefs:missing', new Error('H2O.Studio.store.prefs not available'));
      return;
    }
    /* Sync hydrate immediately — useful when the prefs cache is already
     * populated (e.g. by the fallback adapter's sync path or by a
     * previously-loaded entity). */
    hydrateFromPrefs('boot-sync');
    /* Subscribe so async-loaded values land too. */
    try {
      prefsUnsub = prefs.subscribe(function (evt) {
        if (!evt) return;
        if (evt.type === 'ready') {
          hydrateFromPrefs('boot-async');
        }
        /* Phase 1b ignores prefs set/remove events: this shell is the
         * sole writer of dock open/view. Cross-context sync of UI state
         * is intentionally out of scope (see STUDIO_DOCK_PANEL_CONTRACT
         * "UI state never syncs" rule). */
      });
    } catch (e) {
      recordError('bindPrefs:subscribe', e);
    }
  }

  /* ── Assemble the public namespace ────────────────────────────────── */
  const dockApi = {
    version: VERSION,
    phase: PHASE,
    registerTab: registerTab,
    getTab: getTab,
    unregisterTab: unregisterTab,
    mount: mount,
    unmount: unmount,
    open: open,
    close: close,
    toggle: toggle,
    setView: setView,
    getView: getView,
    getState: getState,
    selfCheck: selfCheck,
    state: stateView,
    events: DOCK_SHELL_EVENTS,
    __shellInstalled: true,
    __phase: PHASE,
  };
  /* `tabs` is exposed as a getter so each read returns a fresh shallow
   * snapshot rather than the live registry object. */
  Object.defineProperty(dockApi, 'tabs', {
    get: tabsView,
    enumerable: true,
  });

  H2O.Studio.dock = dockApi;

  /* Bind prefs after install so subscribers can find dockApi if needed. */
  bindPrefs();
})(globalThis);
