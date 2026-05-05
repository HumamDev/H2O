// ==UserScript==
// @h2o-id             0z1o.dock.panel.tab.control.hub.plugin
// @name               0Z1o.⚫️🎖️🕹️ Dock Panel Tab (Control Hub 🔌 Plugin) 🕹️
// @namespace          H2O.Premium.CGX.dock.panel.tab.control.hub.plugin
// @author             HumamDev
// @version            0.1.0
// @revision           001
// @build              260505-000000
// @description        Registers the Chat Dock / Dock Panel tab controls into Control Hub via plugin API.
// @match       https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = window;
  const TOPW = W.top || W;
  const H2O = (TOPW.H2O = TOPW.H2O || {});
  if (W !== TOPW) W.H2O = H2O;

  const EV_CHUB_READY_V1 = 'h2o.ev:prm:cgx:cntrlhb:ready:v1';
  const MARK = '__H2O_CHUB_DOCK_PANEL_TAB_PLUGIN_V010__';

  if (W[MARK]) return;
  W[MARK] = true;

  let LAST_API = null;

  const FEATURE_KEY_DOCK_PANEL = 'dockPanel';

  const DOCK_PANEL_META = Object.freeze({
    key: FEATURE_KEY_DOCK_PANEL,
    label: 'Chat Dock',
    icon: '🎖️',
    subtitle: 'Docked sidebar with tabs + side-panel controls.',
    category: 'nav',
    insertBefore: 'dataBackup',
    description: Object.freeze({
      default: 'Dock context, tabs, and side-panel controls.',
      focus: 'Lean dock layouts with minimal side-panel clutter.',
      review: 'Highlight nav tabs while keeping the side panel tidy.',
      performance: 'Lazy tab rendering and light side-panel updates.',
    }),
  });

  const DOCK_PANEL_VISIBILITY = Object.freeze({
    selectors: Object.freeze([
      '[data-cgxui-owner="dcpn"]',
    ]),
  });

  const DOCK_PANEL_CONTROLS = Object.freeze([
    Object.freeze({
      type: 'select',
      key: 'spPos',
      label: 'Position',
      def: 'right',
      opts: Object.freeze([
        Object.freeze(['right', 'Right']),
        Object.freeze(['left', 'Left']),
      ]),
    }),
    Object.freeze({
      type: 'range',
      key: 'spWidth',
      label: 'Panel width',
      def: 260,
      min: 220,
      max: 400,
      step: 10,
      unit: 'px',
    }),
  ]);

  function getApi() {
    try {
      const root = TOPW.H2O || W.H2O;
      if (!root) return null;

      const isHubApi = (api) => api && typeof api.registerPlugin === 'function';
      const fast = [
        root?.CH?.cnhb,
        root?.CHUB?.cnhb,
        root?.CGX?.cnhb,
        root?.CH?.cntrlhb,
        root?.CHUB?.cntrlhb,
        root?.CHUB?.chub,
        root?.CGX?.cntrlhb,
        root?.CGX?.chub,
      ];

      for (const node of fast) {
        const api = node?.api;
        if (isHubApi(api)) return api;
      }

      for (const tok of Object.keys(root)) {
        const bucket = root[tok];
        if (!bucket || typeof bucket !== 'object') continue;
        for (const pid of Object.keys(bucket)) {
          const api = bucket?.[pid]?.api;
          if (isHubApi(api)) return api;
        }
      }
    } catch {}
    return null;
  }

  function invalidate(api = LAST_API) {
    if (!api || typeof api.invalidate !== 'function') return;
    try { W.setTimeout(() => api.invalidate(), 0); } catch {}
  }

  function register() {
    const api = getApi();
    if (!api?.registerPlugin) return false;
    if (api === LAST_API) return true;

    try {
      api.registerPlugin({
        key: FEATURE_KEY_DOCK_PANEL,
        title: 'Dock Panel Tab',
        meta: DOCK_PANEL_META,
        category: 'nav',
        visibility: DOCK_PANEL_VISIBILITY,
        getControls() {
          return DOCK_PANEL_CONTROLS;
        },
      });
      LAST_API = api;
      invalidate(api);
      return true;
    } catch (error) {
      try { console.warn('[H2O DockPanelTab] register failed', error); } catch {}
      return false;
    }
  }

  register();
  W.addEventListener(EV_CHUB_READY_V1, register, true);

  if (!LAST_API) {
    let tries = 0;
    const timer = W.setInterval(() => {
      tries += 1;
      if (register() || tries > 80) {
        try { W.clearInterval(timer); } catch {}
      }
    }, 250);
  }
})();
