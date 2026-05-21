/* H2O Studio — Dock Shell (Phase 1a)
 *
 * Publishes H2O.Studio.dock — a passive, mountless registry + state
 * holder for Studio Dock tabs. This phase introduces the namespace and
 * its public API surface; it does NOT:
 *   - mount any DOM (mount/unmount are no-op stubs)
 *   - touch storage (state.open / state.view live in memory only;
 *     persistence lands in Phase 1b via H2O.Studio.store.prefs)
 *   - render any tab (registered tabs are tracked but not painted;
 *     painting lands in Phase 2)
 *   - reach into any feature engine, native runtime, or studio reader
 *
 * Loading this file therefore has no user-visible effect. It only
 * attaches one global: H2O.Studio.dock.
 *
 * Public API (mirrors docs/contracts/studio-dock-tab-registration.md):
 *
 *   registerTab(id, def): void       Add or replace a tab def. Emits
 *                                    'h2o:studio:dock:tab-registered'.
 *   getTab(id): TabDef | null        Read a single tab def or null.
 *   tabs: { [id]: TabDef }           Read-only snapshot of the registry.
 *                                    Returns a fresh shallow copy on
 *                                    each access; do not mutate.
 *   mount(container): void           Phase 1a no-op. Stores reference
 *                                    but does not attach to DOM. Emits
 *                                    'h2o:studio:dock:ready'.
 *   unmount(): void                  Releases stored reference.
 *   open(): void                     state.open = true; emits
 *                                    'h2o:studio:dock:open-changed'.
 *   close(): void                    state.open = false; emits same.
 *   toggle(): void                   Calls open()/close().
 *   setView(id): void                state.view = id; emits
 *                                    'h2o:studio:dock:view-changed'.
 *                                    No render side effect.
 *   getView(): string | null         Current state.view.
 *   state: { open, view, mounted }   Read-only getter view; reads always
 *                                    reflect the live internal state.
 *   events: { ready, viewChanged,
 *             openChanged,
 *             tabRegistered }        Frozen event-name constants.
 *
 * Event delivery uses H2O.events.emit when available; otherwise the
 * emit is silently dropped (defensive: this shell loads after H2O Core
 * in studio.html, but should not throw if Core is missing).
 *
 * Contracts:
 *   docs/contracts/studio-dock-tab-registration.md
 *   docs/architecture/studio-dock-panel-plan.md
 *   src-surfaces-base/studio/STUDIO_DOCK_PANEL_CONTRACT.md
 *   src-surfaces-base/studio/dock/README.md
 */
(function (global) {
  'use strict';

  const H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  /* Idempotency guard — script may be re-included during dev hot reload. */
  if (H2O.Studio.dock && H2O.Studio.dock.__shellInstalled) {
    return;
  }

  /* ── Event-name constants (Studio-local; do not collide with native) ── */
  const DOCK_SHELL_EVENTS = Object.freeze({
    ready:         'h2o:studio:dock:ready',
    viewChanged:   'h2o:studio:dock:view-changed',
    openChanged:   'h2o:studio:dock:open-changed',
    tabRegistered: 'h2o:studio:dock:tab-registered',
  });

  /* ── Internal state (in-memory only in Phase 1a) ─────────────────────── */
  const tabsRegistry = Object.create(null);
  const internalState = {
    open: false,
    view: null,
    mounted: false,
    mountContainer: null,
  };

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function isNonEmptyString(v) {
    return typeof v === 'string' && v.length > 0;
  }

  /* Best-effort event emit. Soft-fails if H2O.events is not yet bound. */
  function softEmit(eventName, detail) {
    try {
      const events = H2O && H2O.events;
      if (events && typeof events.emit === 'function') {
        events.emit(eventName, detail || {});
      }
    } catch (_) {
      /* Passive shell: never throw to callers. */
    }
  }

  /* ── Tab registry ────────────────────────────────────────────────────── */
  function registerTab(id, def) {
    if (!isNonEmptyString(id)) return;
    if (!isPlainObject(def)) return;
    /* Phase 1a accepts whatever def the caller provides; validation of
     * required fields (render, title, etc.) is the host's job in later
     * phases. We only enforce the id key for registry lookup. */
    const stored = Object.assign({}, def, { id: id });
    tabsRegistry[id] = stored;
    softEmit(DOCK_SHELL_EVENTS.tabRegistered, { id: id });
  }

  function getTab(id) {
    if (!isNonEmptyString(id)) return null;
    return tabsRegistry[id] || null;
  }

  /* Fresh shallow copy on each access so external callers cannot mutate
   * the registry. Cheap at expected scale (single-digit tabs). */
  function tabsView() {
    return Object.assign({}, tabsRegistry);
  }

  /* ── No-op shell methods ─────────────────────────────────────────────── */
  function mount(container) {
    /* Phase 1a: no DOM attach, no listeners. Stash the reference so
     * unmount() / later phases can find it. Emit ready exactly once
     * per mount call. */
    internalState.mountContainer = container || null;
    internalState.mounted = true;
    softEmit(DOCK_SHELL_EVENTS.ready, {});
  }

  function unmount() {
    internalState.mountContainer = null;
    internalState.mounted = false;
  }

  function open() {
    if (internalState.open) return;
    internalState.open = true;
    softEmit(DOCK_SHELL_EVENTS.openChanged, { open: true });
  }

  function close() {
    if (!internalState.open) return;
    internalState.open = false;
    softEmit(DOCK_SHELL_EVENTS.openChanged, { open: false });
  }

  function toggle() {
    if (internalState.open) {
      close();
    } else {
      open();
    }
  }

  function setView(id) {
    if (!isNonEmptyString(id)) return;
    if (internalState.view === id) return;
    internalState.view = id;
    softEmit(DOCK_SHELL_EVENTS.viewChanged, { view: id });
  }

  function getView() {
    return internalState.view;
  }

  /* ── Read-only state view ─────────────────────────────────────────────── */
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

  /* ── Assemble the public namespace ────────────────────────────────────── */
  const dockApi = {
    registerTab: registerTab,
    getTab: getTab,
    mount: mount,
    unmount: unmount,
    open: open,
    close: close,
    toggle: toggle,
    setView: setView,
    getView: getView,
    state: stateView,
    events: DOCK_SHELL_EVENTS,
    __shellInstalled: true,
  };
  /* `tabs` is exposed as a getter so each read returns a fresh shallow
   * snapshot rather than the live registry object. */
  Object.defineProperty(dockApi, 'tabs', {
    get: tabsView,
    enumerable: true,
  });

  H2O.Studio.dock = dockApi;
})(globalThis);
