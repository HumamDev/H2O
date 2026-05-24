/* H2O Studio — Dock Shell (Phase 2B)
 *
 * Publishes H2O.Studio.dock — the Studio Dock tab registry, persisted
 * UI state (open / view) via H2O.Studio.store.prefs, and as of Phase
 * 2A a DOM-aware shell that mounts onto a visible Dock container in
 * studio.html.
 *
 * Phase progression:
 *   - Phase 1a: passive namespace + no-op mount/open/close.
 *   - Phase 1b: persistence wiring (open/view → h2o:studio:dock:*).
 *   - Phase 2A: real DOM mount + open/close visual state + close
 *               button wiring. NO feature tabs yet. NO feature-data
 *               rendering. NO write-back. NO cross-surface sync.
 *
 * What this file still does NOT do:
 *   - render any tab content (registered tabs are tracked, never
 *     painted; the dock view area shows a "Phase 2B" placeholder)
 *   - call any feature store (highlights / context / bookmarks /
 *     notes / navigator / capture)
 *   - reach into any feature engine, native runtime, or studio reader
 *   - write any non-Studio key
 *   - own route detection (route gating is purely CSS via the
 *     existing `body[data-route="reader"]` attribute set by studio.js)
 *
 * Persistence rules (unchanged from Phase 1b):
 *   - open: persisted under H2O.Studio.store.prefs.keys.dockOpen
 *           ('h2o:studio:dock:open:v1') as a boolean
 *   - view: persisted under H2O.Studio.store.prefs.keys.dockView
 *           ('h2o:studio:dock:view:v1') as a string id or null
 *   - mounted / tabsRegistry / DOM refs: in-memory only; never persisted
 *
 * Public API (Phase 2A):
 *   version: '0.1.0-phase-2a'
 *   phase: '2a'
 *   registerTab(id, def): void
 *   getTab(id): TabDef | null
 *   unregisterTab(id): boolean
 *   tabs: { [id]: TabDef }                  // fresh shallow copy on read
 *   mount(container): void                  // DOM-aware (Phase 2A)
 *   unmount(): void                         // DOM-aware (Phase 2A)
 *   open(): void                            // persists + DOM visible
 *   close(): void                           // persists + DOM hidden
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
 *                  hasContainer, hasRail, hasBody, hasView,
 *                  errors }
 *
 * Route gating (Phase 2A):
 *   The Dock container is permanently in studio.html, but visibility
 *   is controlled by CSS:
 *     body[data-route="reader"] #studioDock.wbDock--open { display: flex; ... }
 *     #studioDock { display: none; }                  (default rule)
 *   studio.js sets `body.dataset.route` ("list" | "reader" | "linked")
 *   when the user navigates; the existing route plumbing therefore
 *   handles Dock visibility with no JS coupling. open() / close()
 *   manage the .wbDock--open class only — they do not check or
 *   manipulate the route attribute.
 *
 * Auto-mount:
 *   On DOM ready (or immediately if the document is already
 *   interactive), the shell looks up `#studioDock` and calls
 *   mount(container) automatically. Manual mount() from console is
 *   still supported. In environments without `document` (e.g. node
 *   smoke tests), the auto-mount is silently skipped.
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
 *   - Optional: a DOM container with id="studioDock" (used if present)
 *
 * Does NOT depend on:
 *   - chrome.* / localStorage / IndexedDB
 *   - any feature store (highlights / context / bookmarks / notes /
 *     navigator / capture) — the shell does not call them
 *   - studio.js — route gating is via CSS only, no JS hook needed
 */
(function (global) {
  'use strict';

  const H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  /* Idempotency guard — script may be re-included during dev hot reload. */
  if (H2O.Studio.dock && H2O.Studio.dock.__shellInstalled) {
    return;
  }

  const VERSION = '0.1.0-phase-2b';
  const PHASE = '2b';

  /* CSS class applied to the container when open. CSS rules show the
   * container only when this class is present AND the body's route
   * attribute is a reader route. */
  const OPEN_CLASS = 'wbDock--open';

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

  /* DOM references captured at mount time. Cleared at unmount. */
  const dockRefs = {
    container: null,
    rail: null,
    body: null,
    head: null,
    view: null,
    close: null,
  };
  let closeListener = null;

  const errors = [];
  const errMax = 20;
  let prefsUnsub = null;
  let suppressPersist = false;   /* true while hydrating from prefs */

  /* Per-rail-button click listeners + per-render cleanup callback —
   * tracked so unmount and re-render can remove them cleanly. */
  const railListeners = [];        /* [{ el, fn }] */
  let activeRenderCleanup = null;  /* function | null */

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }
  function isNonEmptyString(v) {
    return typeof v === 'string' && v.length > 0;
  }
  function isElement(v) {
    return !!v && typeof v === 'object' && typeof v.nodeType === 'number' && v.nodeType === 1;
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

  /* ── DOM helpers ──────────────────────────────────────────────────── */
  /* Apply current internalState.open to the mounted container, if any.
   * Sets both the `hidden` attribute (for assistive tech and default
   * CSS) and the open class (which the route-gated CSS rule keys off).
   * No-op when not mounted. */
  function applyOpenToDom() {
    if (!dockRefs.container) return;
    try {
      if (internalState.open) {
        if (dockRefs.container.hasAttribute('hidden')) {
          dockRefs.container.removeAttribute('hidden');
        }
        dockRefs.container.classList.add(OPEN_CLASS);
      } else {
        if (!dockRefs.container.hasAttribute('hidden')) {
          dockRefs.container.setAttribute('hidden', '');
        }
        dockRefs.container.classList.remove(OPEN_CLASS);
      }
    } catch (e) {
      recordError('applyOpenToDom', e);
    }
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
    /* Phase 2B: if the shell is already mounted, repaint the rail so
     * newly-registered tabs appear immediately. If the newly-
     * registered tab matches a pending persisted view (validated by
     * hydrateFromPrefs), surface its content. */
    if (dockRefs.rail) {
      renderRail();
      if (internalState.view === id) {
        renderActiveView();
      }
    }
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
      if (dockRefs.rail) renderRail();
      renderActiveView();
    } else if (dockRefs.rail) {
      /* Removed tab wasn't active — still repaint rail so the button
       * for the removed tab is gone. */
      renderRail();
    }
    return true;
  }
  function tabsView() {
    return Object.assign({}, tabsRegistry);
  }
  function tabCount() {
    return Object.keys(tabsRegistry).length;
  }
  /* listTabs() returns an array of registered tab IDs in registration
   * order. Convenience for callers that want a stable ordered list. */
  function listTabs() {
    return Object.keys(tabsRegistry);
  }

  /* ── Rail + view rendering (Phase 2B) ─────────────────────────────────
   * Both helpers are no-ops when the corresponding DOM ref is missing.
   * Neither calls any feature store. Neither writes anything outside
   * the dock view area / rail. */
  function clearRailListeners() {
    for (let i = 0; i < railListeners.length; i += 1) {
      const r = railListeners[i];
      try {
        if (r && r.el && typeof r.el.removeEventListener === 'function') {
          r.el.removeEventListener('click', r.fn);
        }
      } catch (e) { recordError('clearRailListeners', e); }
    }
    railListeners.length = 0;
  }
  function renderRail() {
    if (!dockRefs.rail) return;
    if (typeof document === 'undefined') return;
    clearRailListeners();
    try {
      while (dockRefs.rail.firstChild) {
        dockRefs.rail.removeChild(dockRefs.rail.firstChild);
      }
    } catch (e) {
      recordError('renderRail:clear', e);
      return;
    }
    /* Native-like rail order (Phase 2B): sort by tab def's numeric
     * `order` field if present (mirrors native DPANEL_RAIL_ITEMS).
     * Tabs without an `order` field fall to the end in registration
     * order, preserving back-compat with simpler tab defs. */
    const ids = Object.keys(tabsRegistry);
    ids.sort(function (a, b) {
      const da = tabsRegistry[a];
      const db = tabsRegistry[b];
      const oa = (da && typeof da.order === 'number') ? da.order : Number.POSITIVE_INFINITY;
      const ob = (db && typeof db.order === 'number') ? db.order : Number.POSITIVE_INFINITY;
      if (oa !== ob) return oa - ob;
      return 0;  /* preserve relative registration order */
    });
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      const def = tabsRegistry[id];
      if (!def) continue;
      try {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wbDockRailBtn';
        btn.setAttribute('data-dock-tab', id);
        const isActive = internalState.view === id;
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        if (isActive) btn.classList.add('wbDockRailBtn--active');
        btn.title = String(def.title || id);
        btn.setAttribute('aria-label', String(def.title || id));
        /* Apply per-tab accent color (native parity). The CSS uses
         * the custom property --wb-dock-rail-color to paint a side
         * bar / dot; falls back to a default tint if unset. */
        if (typeof def.color === 'string' && def.color) {
          try { btn.style.setProperty('--wb-dock-rail-color', def.color); }
          catch (_) { /* ignore unsupported CSSOM */ }
        }
        /* Native rail shows a single-letter `txt` (H/B/N/A/V/C/P/F).
         * Use that for compact rail labels; fall back to `icon` then
         * to a derived initial. */
        const label = (typeof def.txt === 'string' && def.txt)
          ? def.txt
          : (typeof def.icon === 'string' && def.icon)
            ? def.icon
            : (def.title ? String(def.title).charAt(0).toUpperCase() : id.charAt(0).toUpperCase());
        const ico = document.createElement('span');
        ico.className = 'wbDockRailBtnIcon';
        ico.setAttribute('aria-hidden', 'true');
        ico.textContent = label;
        btn.appendChild(ico);
        const handler = (function (tabId) {
          return function () { setView(tabId); };
        })(id);
        btn.addEventListener('click', handler);
        railListeners.push({ el: btn, fn: handler });
        dockRefs.rail.appendChild(btn);
      } catch (e) {
        recordError('renderRail:append:' + id, e);
      }
    }
  }
  function renderActiveView() {
    if (!dockRefs.view) return;
    if (typeof document === 'undefined') return;
    /* Run previous tab's cleanup if any. */
    if (typeof activeRenderCleanup === 'function') {
      try { activeRenderCleanup(); }
      catch (e) { recordError('renderActiveView:cleanup', e); }
      activeRenderCleanup = null;
    }
    try {
      while (dockRefs.view.firstChild) {
        dockRefs.view.removeChild(dockRefs.view.firstChild);
      }
    } catch (e) {
      recordError('renderActiveView:clear', e);
      return;
    }
    const id = internalState.view;
    const def = (id && Object.prototype.hasOwnProperty.call(tabsRegistry, id))
      ? tabsRegistry[id]
      : null;
    if (!def || typeof def.render !== 'function') {
      /* Empty-state placeholder: prompt the user to pick a tab once
       * the rail is populated. If no tabs are registered at all this
       * effectively becomes a "no tabs available" hint; we keep the
       * same wording in both cases for simplicity. */
      try {
        const empty = document.createElement('div');
        empty.className = 'wbDockEmpty';
        empty.textContent = tabCount() > 0
          ? 'Select a Dock tab.'
          : 'Dock tabs will appear in Phase 2B.';
        dockRefs.view.appendChild(empty);
      } catch (e) { recordError('renderActiveView:empty', e); }
      return;
    }
    const ctx = {
      surface: 'studio',
      phase: PHASE,
      chatId: null,
      externalId: null,
      snapshotId: null,
    };
    try {
      const ret = def.render(dockRefs.view, ctx);
      if (typeof ret === 'function') {
        activeRenderCleanup = ret;
      }
    } catch (e) {
      recordError('renderActiveView:render:' + id, e);
    }
  }

  /* ── Mount / unmount (Phase 2A — DOM-aware) ───────────────────────── */
  function mount(container) {
    if (!isElement(container)) {
      /* Tolerate the Phase 1a-style call shape (any truthy thing) for
       * back-compat with smoke tests; just record it. */
      internalState.mountContainer = container || null;
      internalState.mounted = true;
      softEmit(DOCK_SHELL_EVENTS.ready, {});
      return;
    }
    /* Re-mounting onto a different container: unmount the previous one
     * first so listeners are cleaned up. */
    if (dockRefs.container && dockRefs.container !== container) {
      unmount();
    }
    internalState.mountContainer = container;
    internalState.mounted = true;
    dockRefs.container = container;
    try {
      dockRefs.rail  = container.querySelector('[data-role="dock-rail"]')  || null;
      dockRefs.body  = container.querySelector('[data-role="dock-body"]')  || null;
      dockRefs.head  = container.querySelector('.wbDockHead')              || null;
      dockRefs.view  = container.querySelector('[data-role="dock-view"]')  || null;
      dockRefs.close = container.querySelector('[data-dock-action="close"]') || null;
    } catch (e) {
      recordError('mount:querySelector', e);
    }
    if (dockRefs.close && typeof dockRefs.close.addEventListener === 'function') {
      closeListener = function () { close(); };
      try { dockRefs.close.addEventListener('click', closeListener); }
      catch (e) { recordError('mount:closeListener', e); closeListener = null; }
    }
    applyOpenToDom();
    /* Phase 2B: render rail buttons + active tab view (if any). Tabs
     * registered before mount appear immediately; tabs registered
     * after mount trigger their own renderRail() via registerTab(). */
    renderRail();
    renderActiveView();
    softEmit(DOCK_SHELL_EVENTS.ready, { mounted: true });
  }
  function unmount() {
    if (dockRefs.close && closeListener && typeof dockRefs.close.removeEventListener === 'function') {
      try { dockRefs.close.removeEventListener('click', closeListener); }
      catch (e) { recordError('unmount:closeListener', e); }
    }
    closeListener = null;
    /* Phase 2B: tear down rail listeners + run any pending tab
     * render cleanup before clearing the container references. */
    clearRailListeners();
    if (typeof activeRenderCleanup === 'function') {
      try { activeRenderCleanup(); }
      catch (e) { recordError('unmount:activeRenderCleanup', e); }
      activeRenderCleanup = null;
    }
    dockRefs.container = null;
    dockRefs.rail = null;
    dockRefs.body = null;
    dockRefs.head = null;
    dockRefs.view = null;
    dockRefs.close = null;
    internalState.mountContainer = null;
    internalState.mounted = false;
  }

  /* ── Open / close / toggle (persist via prefs + apply to DOM) ─────── */
  function open() {
    if (internalState.open) return;
    internalState.open = true;
    persistOpen(true);
    applyOpenToDom();
    softEmit(DOCK_SHELL_EVENTS.openChanged, { open: true });
  }
  function close() {
    if (!internalState.open) return;
    internalState.open = false;
    persistOpen(false);
    applyOpenToDom();
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
      if (dockRefs.rail) renderRail();
      renderActiveView();
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
    /* Phase 2B: update rail active state + repaint view. */
    if (dockRefs.rail) renderRail();
    renderActiveView();
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
      hasContainer: !!dockRefs.container,
      hasRail:      !!dockRefs.rail,
      hasBody:      !!dockRefs.body,
      hasView:      !!dockRefs.view,
      errors: errors.slice(),
    };
  }

  /* ── Boot hydration (sync + async via prefs ready event) ──────────── */
  function hydrateFromPrefs(reason) {
    const prefs = getPrefs();
    if (!prefs) return;
    suppressPersist = true;
    let viewChangedDuringHydrate = false;
    try {
      const persistedOpen = prefs.get(prefs.keys.dockOpen, undefined);
      if (typeof persistedOpen === 'boolean' && persistedOpen !== internalState.open) {
        const wasOpen = internalState.open;
        internalState.open = persistedOpen;
        applyOpenToDom();
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
            viewChangedDuringHydrate = true;
            softEmit(DOCK_SHELL_EVENTS.viewChanged, { view: null, previous: oldView, source: reason || 'hydrate' });
          } else if (Object.prototype.hasOwnProperty.call(tabsRegistry, persistedView)) {
            const oldView = internalState.view;
            internalState.view = persistedView;
            viewChangedDuringHydrate = true;
            softEmit(DOCK_SHELL_EVENTS.viewChanged, { view: persistedView, previous: oldView, source: reason || 'hydrate' });
          }
          /* If persistedView is a non-registered string, leave state
           * alone and do NOT clear — we just can't safely apply it.
           * registerTab() will re-paint when the matching tab loads. */
        }
      }
    } catch (e) {
      recordError('hydrate', e);
    }
    suppressPersist = false;
    /* Phase 2B: if hydration produced a real view change AND the shell
     * is mounted, repaint the rail (active state) + view. */
    if (viewChangedDuringHydrate && dockRefs.rail) {
      renderRail();
      renderActiveView();
    }
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
        /* Phase 2A continues to ignore prefs set/remove events: this
         * shell is the sole writer of dock open/view. Cross-context
         * sync of UI state is intentionally out of scope (see
         * STUDIO_DOCK_PANEL_CONTRACT "UI state never syncs" rule). */
      });
    } catch (e) {
      recordError('bindPrefs:subscribe', e);
    }
  }

  /* ── Auto-mount (Phase 2A) ────────────────────────────────────────── */
  /* Look up the Dock container in studio.html and mount automatically.
   * Safe in environments without `document` (node smoke tests skip).
   * Manual mount() from console remains supported. */
  function autoMount() {
    try {
      if (typeof document === 'undefined') return;
      const el = document.getElementById('studioDock');
      if (el) {
        mount(el);
      }
    } catch (e) {
      recordError('autoMount', e);
    }
  }
  function scheduleAutoMount() {
    try {
      if (typeof document === 'undefined') return;
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        autoMount();
      } else if (typeof document.addEventListener === 'function') {
        document.addEventListener('DOMContentLoaded', autoMount, { once: true });
      }
    } catch (e) {
      recordError('scheduleAutoMount', e);
    }
  }

  /* ── Assemble the public namespace ────────────────────────────────── */
  const dockApi = {
    version: VERSION,
    phase: PHASE,
    registerTab: registerTab,
    getTab: getTab,
    unregisterTab: unregisterTab,
    listTabs: listTabs,
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

  /* Schedule auto-mount onto #studioDock once the DOM is ready. */
  scheduleAutoMount();
})(globalThis);
