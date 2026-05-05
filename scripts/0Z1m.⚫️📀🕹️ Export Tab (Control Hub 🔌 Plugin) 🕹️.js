// ==UserScript==
// @h2o-id             0z1m.export.tab.control.hub.plugin
// @name               0Z1m.⚫️📀🕹️ Export Tab (Control Hub 🔌 Plugin) 🕹️
// @namespace          H2O.Premium.CGX.export.tab.control.hub.plugin
// @author             HumamDev
// @version            0.1.0
// @revision           001
// @build              260505-000000
// @description        Registers the Export tab controls into Control Hub via plugin API.
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
  const MARK = '__H2O_CHUB_EXPORT_TAB_PLUGIN_V010__';

  if (W[MARK]) return;
  W[MARK] = true;

  let LAST_API = null;

  const FEATURE_KEY_EXPORT = 'export';
  const FEATURE_KEY_SAVE_EXPORT = 'saveExport';

  const EXPORT_META = Object.freeze({
    key: FEATURE_KEY_EXPORT,
    label: 'Export',
    icon: '📀',
    subtitle: 'Markdown / HTML / package export controls.',
    category: 'save',
    insertBefore: 'library',
    toggleHidden: true,
    description: Object.freeze({
      default: 'Keep export defaults and output behavior in one dedicated export tab.',
      focus: 'Preset export settings before capturing focused review bundles.',
      review: 'Prepare clean handoff exports without mixing them into backup tools.',
      performance: 'Use the smallest export path that still preserves what you need.',
    }),
  });

  const EXPORT_VISIBILITY = Object.freeze({
    selectors: Object.freeze([
      '[data-cgxui-owner="xpch"]',
      '[data-cgxui-owner="prmn"][data-cgxui="prmn-export-btn"]',
      '[data-cgxui-owner="nvcn"][data-cgxui="nvcn-export-btn"]',
      '.cgxui-xpch-export-btn',
      '.cgxui-xpch-export-wrap',
    ]),
  });

  const SAVE_EXPORT_CONTROLS = Object.freeze([
    Object.freeze({
      type: 'select',
      key: 'svFormat',
      label: 'Default format',
      def: 'markdown',
      opts: Object.freeze([
        Object.freeze(['markdown', 'Markdown']),
        Object.freeze(['html', 'HTML']),
        Object.freeze(['onenote', 'OneNote (future)']),
      ]),
    }),
    Object.freeze({
      type: 'toggle',
      key: 'svAutoDl',
      label: 'Auto-download',
      def: false,
    }),
  ]);

  const EXPORT_CONTROLS_BY_KEY = Object.freeze({
    [FEATURE_KEY_SAVE_EXPORT]: SAVE_EXPORT_CONTROLS,
  });

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
        key: FEATURE_KEY_EXPORT,
        title: 'Export Tab',
        meta: EXPORT_META,
        category: 'save',
        visibility: EXPORT_VISIBILITY,
        controlsByKey: EXPORT_CONTROLS_BY_KEY,
      });
      LAST_API = api;
      invalidate(api);
      return true;
    } catch (error) {
      try { console.warn('[H2O ExportTab] register failed', error); } catch {}
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
