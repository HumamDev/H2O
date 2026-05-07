// ==UserScript==
// @h2o-id             0z1n.prompt.manager.tab.control.hub.plugin
// @name               0Z1n.⚫️✍️🕹️ Prompt Manager Tab (Control Hub 🔌 Plugin) 🕹️
// @namespace          H2O.Premium.CGX.prompt.manager.tab.control.hub.plugin
// @author             HumamDev
// @version            0.1.0
// @revision           001
// @build              260505-000000
// @description        Registers the Prompt Manager tab controls into Control Hub via plugin API.
// @match       https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = window;
  const TOPW = W.top || W;
  const D = document;
  const H2O = (TOPW.H2O = TOPW.H2O || {});
  if (W !== TOPW) W.H2O = H2O;

  const EV_CHUB_READY_V1 = 'h2o.ev:prm:cgx:cntrlhb:ready:v1';
  const EV_PM_READY_V1 = 'evt:h2o:pm:ready:v1';
  const MARK = '__H2O_CHUB_PROMPT_MANAGER_TAB_PLUGIN_V010__';

  // Phase 4 Step 5d (pilot): canonical alias-id for L5 on-demand wiring.
  // Must match the catalog key in build/chrome-ext-prod/loader.js
  // DEV_SCRIPT_CATALOG and the entry in config/loader-tiers.json.
  const ALIAS_ID = '0Z1n._Prompt_Manager_Tab_(Control_Hub_Plugin)_.js';
  const OPEN_EVENT = 'evt:h2o:chub:open';

  if (W[MARK]) return;
  W[MARK] = true;

  let LAST_API = null;
  let CLS = 'cgxui-cnhb';

  const STATE = {
    pm: null,
    pmApi: null,
  };

  const FEATURE_KEY_PROMPT_MANAGER = 'promptManager';

  const PROMPT_MANAGER_META = Object.freeze({
    key: FEATURE_KEY_PROMPT_MANAGER,
    label: 'Prompt Manager',
    icon: '✍️',
    subtitle: 'Prompt library, search, tray, and quick prompt actions.',
    category: 'mark',
    insertBefore: 'dockPanel',
    description: Object.freeze({
      default: 'Open Prompt Manager, focus its search, and control the quick prompt tray from one place.',
      focus: 'Keep prompt lookup close without digging through the composer area.',
      review: 'Jump between saved prompts and quick tray tools while reviewing long chats.',
      performance: 'Use prompt tooling directly without keeping extra panels open longer than needed.',
    }),
  });

  const PROMPT_MANAGER_VISIBILITY = Object.freeze({
    selectors: Object.freeze([
      '[data-cgxui-owner="prmn"]',
    ]),
  });

  function safeCall(_label, fn) {
    try { return fn(); } catch {}
    return undefined;
  }

  function findHubNode() {
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
        if (isHubApi(node?.api)) return node;
      }

      for (const tok of Object.keys(root)) {
        const bucket = root[tok];
        if (!bucket || typeof bucket !== 'object') continue;
        for (const pid of Object.keys(bucket)) {
          const node = bucket?.[pid];
          if (isHubApi(node?.api)) return node;
        }
      }
    } catch {}
    return null;
  }

  function getApi() {
    return findHubNode()?.api || null;
  }

  function applySkin(api) {
    let skin = null;
    try { skin = typeof api?.getSkin === 'function' ? api.getSkin() : null; } catch {}
    CLS = skin?.CLS || CLS;
  }

  function invalidate(api = LAST_API || getApi()) {
    if (!api || typeof api.invalidate !== 'function') return;
    try { W.setTimeout(() => api.invalidate(), 0); } catch {}
  }

  function CHUB_PM_api() {
    return findHubNode()?.state?.pmApi || STATE.pmApi || W.H2O?.PromptManager || TOPW.H2O?.PromptManager || null;
  }

  function CHUB_PM_openAction() {
    const ok = safeCall('promptManager.open', () => CHUB_PM_api()?.open?.());
    invalidate();
    return { message: ok ? 'Prompt Manager opened.' : 'Prompt Manager is unavailable.' };
  }

  function CHUB_PM_closeAction() {
    const ok = safeCall('promptManager.close', () => CHUB_PM_api()?.close?.());
    invalidate();
    return { message: ok ? 'Prompt Manager closed.' : 'Prompt Manager is unavailable.' };
  }

  function CHUB_PM_focusSearchAction() {
    const ok = safeCall('promptManager.focusSearch', () => CHUB_PM_api()?.focusSearch?.());
    invalidate();
    return { message: ok ? 'Prompt search focused.' : 'Prompt search is unavailable.' };
  }

  function CHUB_PM_toggleQuickTrayAction() {
    const ok = safeCall('promptManager.toggleQuickTray', () => CHUB_PM_api()?.toggleQuickTray?.());
    invalidate();
    return { message: ok ? 'Quick tray toggled.' : 'Quick tray is unavailable.' };
  }

  function renderInfoList(items) {
    const rows = Array.isArray(items) ? items.filter((item) => item && item.value != null && String(item.value).trim() !== '') : [];
    const root = D.createElement('div');
    root.className = `${CLS}-infoList`;
    if (!rows.length) return root;

    for (const item of rows) {
      const row = D.createElement('div');
      row.className = `${CLS}-infoLine`;

      const key = D.createElement('span');
      key.className = `${CLS}-infoKey`;
      key.textContent = item.label || 'Info';

      const value = D.createElement('span');
      value.className = `${CLS}-infoVal`;
      value.textContent = String(item.value || '');

      row.append(key, value);
      root.appendChild(row);
    }
    return root;
  }

  function CHUB_PM_renderStatus() {
    const api = CHUB_PM_api();
    const isOpen = !!safeCall('promptManager.isOpen', () => api?.isOpen?.());
    return renderInfoList([
      { label: 'Ready', value: api ? 'Yes' : 'No' },
      { label: 'Panel', value: isOpen ? 'Open' : 'Closed' },
    ]);
  }

  const PROMPT_MANAGER_CONTROLS = Object.freeze([
    Object.freeze({
      type: 'custom',
      key: 'promptManagerStatus',
      label: 'Status',
      group: 'Prompt Manager',
      render() { return CHUB_PM_renderStatus(); },
    }),
    Object.freeze({
      type: 'action',
      key: 'promptManagerPanel',
      label: 'Panel',
      group: 'Prompt Manager',
      statusText: '',
      buttons: Object.freeze([
        Object.freeze({ label: 'Open', primary: true, action: () => CHUB_PM_openAction() }),
        Object.freeze({ label: 'Focus Search', action: () => CHUB_PM_focusSearchAction() }),
        Object.freeze({ label: 'Close', action: () => CHUB_PM_closeAction() }),
      ]),
    }),
    Object.freeze({
      type: 'action',
      key: 'promptManagerQuickTray',
      label: 'Quick Tray',
      group: 'Quick Tools',
      statusText: '',
      buttons: Object.freeze([
        Object.freeze({ label: 'Toggle Quick Tray', primary: true, action: () => CHUB_PM_toggleQuickTrayAction() }),
      ]),
    }),
  ]);

  function capturePromptManagerReady(event) {
    try {
      STATE.pm = event?.detail || null;
      STATE.pmApi = event?.detail?.api || null;
    } catch {}
    invalidate();
  }

  function register() {
    const api = getApi();
    if (!api?.registerPlugin) return false;
    if (api === LAST_API) return true;

    try {
      applySkin(api);
      api.registerPlugin({
        key: FEATURE_KEY_PROMPT_MANAGER,
        title: 'Prompt Manager Tab',
        meta: PROMPT_MANAGER_META,
        category: 'mark',
        visibility: PROMPT_MANAGER_VISIBILITY,
        getControls() {
          return PROMPT_MANAGER_CONTROLS;
        },
      });
      LAST_API = api;
      invalidate(api);
      return true;
    } catch (error) {
      try { console.warn('[H2O PromptManagerTab] register failed', error); } catch {}
      return false;
    }
  }

  // Phase 4 Step 5d (pilot): the script's existing MARK guard above protects
  // against the IIFE running twice (the loader's content-script-injection
  // could in principle re-inject — already prevented). H2O.loader.guard adds
  // a second canonical layer keyed by ALIAS_ID so any future
  // registerOnDemand-triggered re-load (e.g. on a second Control Hub open
  // before MARK is set on the first load) is also a no-op.
  //
  // Functionally this block does what the original four init lines did:
  //   - listen for EV_PM_READY_V1
  //   - register() once immediately
  //   - retry on EV_CHUB_READY_V1
  //   - poll every 250ms × 80 as a last-resort fallback
  // Wrapping in guard does NOT change V1 behavior — when V2 is OFF, the
  // tab loads eagerly at boot, runs this init once, MARK + guard both set.
  // When V2 is ON, the tab loads on-demand after Control Hub open, runs
  // this init once (MARK + guard set), and re-fires of the open-event
  // are no-ops at all three layers (loader dedup → MARK → guard).
  const __doInit = () => {
    W.addEventListener(EV_PM_READY_V1, capturePromptManagerReady, true);

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
  };

  // Register for on-demand loading (V2-aware; harmless under V1).
  // When V2 is OFF: the Bridge subscribes to OPEN_EVENT but the loader's
  // V2 listener is not installed, so any dispatch of
  // evt:h2o:loader:on-demand-load is a no-op. When V2 is ON and this
  // script is loaded eagerly (because tier metadata wasn't synced),
  // the registerOnDemand call still records in the registry but the
  // loader would have already loaded the script via phaseIdle.
  try {
    const loaderApi = (W && W.H2O && W.H2O.loader) || null;
    if (loaderApi && typeof loaderApi.registerOnDemand === 'function') {
      loaderApi.registerOnDemand(ALIAS_ID, OPEN_EVENT);
    }
    if (loaderApi && typeof loaderApi.guard === 'function') {
      loaderApi.guard(ALIAS_ID, __doInit);
    } else {
      // Fallback: H2O.loader.guard not available (Bridge missing for some
      // reason). MARK guard above already protects against double-IIFE,
      // so just call init directly.
      __doInit();
    }
  } catch (_) {
    // Defensive: any throw in the loader-API path falls back to direct init.
    try { __doInit(); } catch (_) {}
  }
})();
