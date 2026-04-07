// ==UserScript==
// @h2o-id             0z1d.performance.tab.control.hub.plugin
// @name               0Z1d.⚫️⚡️🕹️ Performance Tab (Control Hub 🔌 Plugin) 🕹️
// @namespace          H2O.Premium.CGX.performance.tab.control.hub.plugin
// @author             HumamDev
// @version            0.2.0
// @revision           001
// @build              260405-000000
// @description        Registers the Performance subtab controls into Control Hub via plugin API.
// @match              https://chatgpt.com/*
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
  const EV_CHAT_MECHANISMS_CHANGED = 'evt:h2o:chat-mechanisms:changed';
  const EV_UNMOUNT_CFG_CHANGED = 'evt:h2o:unmount:configchanged';
  const EV_PAGINATION_CFG_CHANGED = 'evt:h2o:pagination:configchanged';
  const KEY_CHUB_CHAT_MECHANISMS_V1 = 'h2o:prm:cgx:cntrlhb:state:chat-mechanisms:v1';
  const MARK = '__H2O_CHUB_PERF_TAB_PLUGIN_V020__';

  if (W[MARK]) return;
  W[MARK] = true;

  const CHAT_MECH_DEFAULT = Object.freeze({
    version: 1,
    gestureBackend: 'legacy',
    dividerDblClickMode: 'pagination-focus-page',
    coordination: Object.freeze({
      manualWinsOverGlobal: true,
      preserveLegacyEvents: true,
      preserveUxOwners: true,
    }),
  });

  let LAST_API = null;
  let LISTENERS_BOUND = false;

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

  function safeCall(fn) {
    try { return fn(); } catch {}
    return undefined;
  }

  function invalidateHub() {
    try { LAST_API?.invalidate?.(); } catch {}
  }

  function bindLiveInvalidation() {
    if (LISTENERS_BOUND) return;
    LISTENERS_BOUND = true;

    const onInvalidate = () => invalidateHub();
    W.addEventListener(EV_CHAT_MECHANISMS_CHANGED, onInvalidate, true);
    W.addEventListener(EV_UNMOUNT_CFG_CHANGED, onInvalidate, true);
    W.addEventListener(EV_PAGINATION_CFG_CHANGED, onInvalidate, true);
  }

  function getUnmountApi() {
    return W.H2O?.UM?.nmntmssgs?.api || null;
  }

  function getUnmountSetting(key, fallback) {
    const api = getUnmountApi();
    const cfg = safeCall(() => api?.getConfig?.()) || null;
    if (!cfg || typeof cfg !== 'object') return fallback;

    switch (String(key || '')) {
      case 'umEnabled': return cfg.enabled !== false;
      case 'umMinMessages': return Number(cfg.minMsgsForUnmount) || fallback;
      case 'umMarginPx': return Number(cfg.unmountMarginPx) || fallback;
      case 'umRestoreMode': return String(cfg.restoreMode || fallback || 'both');
      case 'umIntervalSec': return Math.round((Number(cfg.intervalMs) || 0) / 1000) || fallback;
      case 'umMountProtectMs': return Number(cfg.mountProtectMs) || fallback;
      case 'umKeepQuoteCache': return cfg.keepQuoteCache !== false;
      case 'umKeepRevisionMeta': return cfg.keepRevisionMeta !== false;
      default: return fallback;
    }
  }

  function setUnmountSetting(key, val) {
    const api = getUnmountApi();
    return !!safeCall(() => api?.applySetting?.(key, val));
  }

  function runUnmountPass(reason = 'control-hub') {
    const api = getUnmountApi();
    const ok = !!safeCall(() => api?.runPass?.(reason));
    return { message: ok ? 'Pass completed.' : 'Unmount module unavailable.' };
  }

  function remountAll(reason = 'control-hub') {
    const api = getUnmountApi();
    const count = Number(safeCall(() => api?.remountAll?.(reason)) || 0);
    return { message: count > 0 ? `Remounted ${count} turn(s).` : 'No collapsed turns were found.' };
  }

  function getPaginationApi() {
    return TOPW.H2O_Pagination || W.H2O_Pagination || null;
  }

  function getPaginationConfig() {
    return safeCall(() => getPaginationApi()?.getConfig?.()) || null;
  }

  function getPaginationPageInfo() {
    return safeCall(() => getPaginationApi()?.getPageInfo?.()) || null;
  }

  function paginationPageLabel(info) {
    const model = info && typeof info === 'object' ? info : getPaginationPageInfo();
    if (!model || typeof model !== 'object') return 'Page info unavailable.';
    const pageIndex = Number(model.pageIndex) || 0;
    const pageCount = Math.max(1, Number(model.pageCount) || 1);
    const totalAnswers = Math.max(0, Number(model.totalAnswers) || 0);
    return `Page ${pageIndex + 1}/${pageCount} • ${totalAnswers} answers`;
  }

  function getPaginationSetting(key, fallback) {
    const cfg = getPaginationConfig();
    if (!cfg || typeof cfg !== 'object') return fallback;

    switch (String(key || '')) {
      case 'pwEnabled': return cfg.enabled !== false;
      case 'pwPageSize': return Number(cfg.pageSize) || fallback;
      case 'pwBufferAnswers': return Number(cfg.bufferAnswers) || fallback;
      case 'pwShortcutsEnabled': return cfg.shortcutsEnabled !== false;
      case 'pwAutoLoadSentinel': return !!cfg.autoLoadSentinel;
      case 'pwStyleMode': return String(cfg.styleMode || fallback || 'normal');
      case 'pwSwapMode': return String(cfg.swapMode || fallback || 'root');
      case 'pwDebug': return !!cfg.debug;
      default: return fallback;
    }
  }

  function setPaginationSetting(key, val) {
    const api = getPaginationApi();
    return !!safeCall(() => api?.applySetting?.(key, val));
  }

  function goPagination(direction) {
    const api = getPaginationApi();
    if (!api) return { message: 'Pagination module unavailable.' };

    const infoBefore = getPaginationPageInfo();
    const handlers = {
      first: () => api.goFirst?.('control-hub:first'),
      older: () => api.goOlder?.('control-hub:older'),
      newer: () => api.goNewer?.('control-hub:newer'),
      last: () => api.goLast?.('control-hub:last'),
    };
    const run = handlers[String(direction || '')];
    const ok = !!safeCall(() => run?.());
    if (!ok) {
      const enabled = getPaginationSetting('pwEnabled', true);
      return { message: enabled ? 'No page change.' : 'Pagination is disabled.' };
    }

    return {
      message: paginationPageLabel(infoBefore) === paginationPageLabel()
        ? 'Already there.'
        : paginationPageLabel(),
    };
  }

  function rebuildPagination(reason = 'control-hub:rebuild') {
    const api = getPaginationApi();
    const ok = !!safeCall(() => api?.rebuildIndex?.(reason));
    return { message: ok ? paginationPageLabel() : 'Pagination rebuild failed or is unavailable.' };
  }

  function getChatMechanismsApi() {
    return TOPW.H2O?.CM?.chtmech?.api || W.H2O?.CM?.chtmech?.api || null;
  }

  function readLiveGlobals() {
    return {
      globalUnmount: getUnmountSetting('umEnabled', false),
      globalPagination: getPaginationSetting('pwEnabled', false),
    };
  }

  function normalizeGestureBackend(raw, globals = readLiveGlobals()) {
    const val = String(raw || 'legacy').trim().toLowerCase();
    let next = (val === 'legacy' || val === 'engine' || val === 'off') ? val : 'legacy';
    if (next === 'off' && !globals.globalUnmount && !globals.globalPagination) next = 'legacy';
    return next;
  }

  function normalizeDividerMode(raw) {
    const val = String(raw || 'pagination-focus-page').trim().toLowerCase();
    return (val === 'pagination-focus-page' || val === 'unmount-page-collapse') ? val : 'pagination-focus-page';
  }

  function normalizeChatMechanismsConfig(input, globals = readLiveGlobals()) {
    const src = (input && typeof input === 'object') ? input : {};
    return {
      version: 1,
      gestureBackend: normalizeGestureBackend(src.gestureBackend, globals),
      dividerDblClickMode: normalizeDividerMode(src.dividerDblClickMode),
      coordination: {
        manualWinsOverGlobal: src?.coordination?.manualWinsOverGlobal !== false,
        preserveLegacyEvents: src?.coordination?.preserveLegacyEvents !== false,
        preserveUxOwners: src?.coordination?.preserveUxOwners !== false,
      },
    };
  }

  function readChatMechanismsFallback() {
    try {
      const raw = TOPW.localStorage?.getItem?.(KEY_CHUB_CHAT_MECHANISMS_V1);
      if (!raw) return normalizeChatMechanismsConfig(CHAT_MECH_DEFAULT);
      return normalizeChatMechanismsConfig(JSON.parse(raw));
    } catch {
      return normalizeChatMechanismsConfig(CHAT_MECH_DEFAULT);
    }
  }

  function writeChatMechanismsFallback(next) {
    const clean = normalizeChatMechanismsConfig(next);
    try { TOPW.localStorage?.setItem?.(KEY_CHUB_CHAT_MECHANISMS_V1, JSON.stringify(clean)); } catch {}
    return clean;
  }

  function getChatMechanismsConfig() {
    const api = getChatMechanismsApi();
    if (api?.getConfig) return safeCall(() => api.getConfig()) || normalizeChatMechanismsConfig(CHAT_MECH_DEFAULT);
    return readChatMechanismsFallback();
  }

  function setChatMechanismsConfig(partial) {
    const api = getChatMechanismsApi();
    if (api?.setConfig) return safeCall(() => api.setConfig(partial)) || getChatMechanismsConfig();
    const current = readChatMechanismsFallback();
    return writeChatMechanismsFallback({
      ...current,
      ...((partial && typeof partial === 'object') ? partial : {}),
      coordination: {
        ...current.coordination,
        ...(((partial && typeof partial === 'object') ? partial.coordination : null) || {}),
      },
    });
  }

  function getResolvedModeModel() {
    const api = getChatMechanismsApi();
    if (api?.getResolvedMode) {
      const model = safeCall(() => api.getResolvedMode());
      if (model && typeof model === 'object') return model;
    }
    const cfg = getChatMechanismsConfig();
    const globals = readLiveGlobals();
    const anyGlobal = !!(globals.globalUnmount || globals.globalPagination);
    let label = 'Method 1 only';
    if (cfg.gestureBackend === 'engine') label = anyGlobal ? 'Method 2 + Method 3' : 'Method 2 only';
    else if (cfg.gestureBackend === 'off') label = 'Method 3 only';
    else label = anyGlobal ? 'Method 1 + Method 3' : 'Method 1 only';
    return {
      gestureBackend: cfg.gestureBackend,
      dividerDblClickMode: cfg.dividerDblClickMode,
      globalUnmount: globals.globalUnmount,
      globalPagination: globals.globalPagination,
      label,
    };
  }

  function renderResolvedModeInfo() {
    const resolved = getResolvedModeModel();
    const wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gap = '6px';
    wrap.style.width = '100%';

    const lines = [
      ['Resolved', resolved.label || 'Unavailable'],
      ['Gesture Backend', resolved.gestureBackend || 'legacy'],
      ['Global Unmount', resolved.globalUnmount ? 'On' : 'Off'],
      ['Global Pagination', resolved.globalPagination ? 'On' : 'Off'],
      ['Divider Dblclick', resolved.dividerDblClickMode || 'pagination-focus-page'],
    ];

    for (const [label, value] of lines) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.gap = '12px';
      row.style.fontSize = '12px';

      const left = document.createElement('span');
      left.style.opacity = '0.72';
      left.textContent = label;

      const right = document.createElement('span');
      right.style.fontWeight = '600';
      right.style.textAlign = 'right';
      right.textContent = value;

      row.append(left, right);
      wrap.appendChild(row);
    }

    return wrap;
  }

  const CHAT_MECHANISMS_CONTROLS = [
    {
      type: 'custom',
      key: 'cmResolvedMode',
      label: 'Resolved Runtime Mode',
      group: 'Mode',
      stackBelowLabel: true,
      render() { return renderResolvedModeInfo(); },
    },
    {
      type: 'select',
      key: 'cmGestureBackend',
      label: 'Gesture Backend',
      group: 'Mode',
      def: 'legacy',
      opts: [
        ['legacy', 'Method 1 — Legacy'],
        ['engine', 'Method 2 — Engine-backed'],
        ['off', 'Off — No Gesture Backend'],
      ],
      getLive() { return String(getChatMechanismsConfig().gestureBackend || 'legacy'); },
      setLive(v) { setChatMechanismsConfig({ gestureBackend: v }); },
    },
    {
      type: 'toggle',
      key: 'cmGlobalUnmount',
      label: 'Method 3 — Global Unmount',
      group: 'Global Chat Optimization',
      def: false,
      getLive() { return getUnmountSetting('umEnabled', false); },
      setLive(v) { setUnmountSetting('umEnabled', !!v); },
    },
    {
      type: 'toggle',
      key: 'cmGlobalPagination',
      label: 'Method 3 — Global Pagination',
      group: 'Global Chat Optimization',
      def: false,
      getLive() { return getPaginationSetting('pwEnabled', false); },
      setLive(v) { setPaginationSetting('pwEnabled', !!v); },
    },
    {
      type: 'select',
      key: 'cmDividerDblClickMode',
      label: 'Divider Double-click Meaning',
      group: 'Engine Semantics',
      def: 'pagination-focus-page',
      opts: [
        ['pagination-focus-page', 'Focus Page With Pagination'],
        ['unmount-page-collapse', 'Collapse Page With Unmount'],
      ],
      getLive() { return String(getChatMechanismsConfig().dividerDblClickMode || 'pagination-focus-page'); },
      setLive(v) { setChatMechanismsConfig({ dividerDblClickMode: v }); },
    },
  ];

  const UNMOUNT_CONTROLS = [
    {
      type: 'toggle',
      key: 'umEnabled',
      label: 'Enable Unmounting',
      def: true,
      group: 'Engine',
      getLive() { return getUnmountSetting('umEnabled', true); },
      setLive(v) { setUnmountSetting('umEnabled', !!v); },
    },
    {
      type: 'range',
      key: 'umMinMessages',
      label: 'Start After Messages',
      help: 'Minimum message count before virtualization starts.',
      def: 25,
      min: 8,
      max: 240,
      step: 1,
      unit: '',
      group: 'Thresholds',
      getLive() { return getUnmountSetting('umMinMessages', 25); },
      setLive(v) { setUnmountSetting('umMinMessages', v); },
    },
    {
      type: 'range',
      key: 'umMarginPx',
      label: 'Viewport Safety Margin',
      help: 'Keep this many px around viewport mounted.',
      def: 2000,
      min: 300,
      max: 8000,
      step: 100,
      unit: 'px',
      group: 'Thresholds',
      getLive() { return getUnmountSetting('umMarginPx', 2000); },
      setLive(v) { setUnmountSetting('umMarginPx', v); },
    },
    {
      type: 'select',
      key: 'umRestoreMode',
      label: 'Restore Trigger',
      help: 'Choose whether collapsed turns restore on scroll, click, or either method.',
      def: 'both',
      opts: [['both', 'Either Scroll / Click'], ['scroll', 'Scroll Only'], ['click', 'Click Only']],
      group: 'Thresholds',
      getLive() { return getUnmountSetting('umRestoreMode', 'both'); },
      setLive(v) { setUnmountSetting('umRestoreMode', v); },
    },
    {
      type: 'range',
      key: 'umIntervalSec',
      label: 'Background Check Interval',
      help: 'Periodic refresh used while idle.',
      def: 20,
      min: 3,
      max: 120,
      step: 1,
      unit: 's',
      group: 'Timing',
      getLive() { return getUnmountSetting('umIntervalSec', 20); },
      setLive(v) { setUnmountSetting('umIntervalSec', v); },
    },
    {
      type: 'range',
      key: 'umMountProtectMs',
      label: 'Mount Protect Window',
      help: 'Delay before a requested remount can be unmounted again.',
      def: 1600,
      min: 300,
      max: 8000,
      step: 100,
      unit: 'ms',
      group: 'Timing',
      getLive() { return getUnmountSetting('umMountProtectMs', 1600); },
      setLive(v) { setUnmountSetting('umMountProtectMs', v); },
    },
    {
      type: 'toggle',
      key: 'umKeepQuoteCache',
      label: 'Keep Quote Badge Cache',
      help: 'Preserves QWrap quote markers for MiniMap Quote Badges while collapsed.',
      def: true,
      group: 'Compatibility',
      getLive() { return getUnmountSetting('umKeepQuoteCache', true); },
      setLive(v) { setUnmountSetting('umKeepQuoteCache', !!v); },
    },
    {
      type: 'toggle',
      key: 'umKeepRevisionMeta',
      label: 'Keep Revision Metadata',
      help: 'Keeps Q/A revision counters available for MiniMap Revision Badges.',
      def: true,
      group: 'Compatibility',
      getLive() { return getUnmountSetting('umKeepRevisionMeta', true); },
      setLive(v) { setUnmountSetting('umKeepRevisionMeta', !!v); },
    },
    {
      type: 'action',
      key: 'umActions',
      label: 'Maintenance',
      group: 'Actions',
      statusText: '',
      buttons: [
        {
          label: 'Run Pass',
          primary: true,
          action: () => runUnmountPass('control-hub:manual-pass'),
          successText: 'Pass completed.',
          errorText: 'Pass failed.',
        },
        {
          label: 'Remount All',
          action: () => remountAll('control-hub:remount-all'),
          successText: 'All collapsed turns restored.',
          errorText: 'Remount failed.',
        },
      ],
    },
  ];

  const PAGINATION_CONTROLS = [
    {
      type: 'toggle',
      key: 'pwEnabled',
      label: 'Enable Pagination',
      def: true,
      group: 'Engine',
      getLive() { return getPaginationSetting('pwEnabled', true); },
      setLive(v) { setPaginationSetting('pwEnabled', !!v); },
    },
    {
      type: 'range',
      key: 'pwPageSize',
      label: 'Answers Per Page',
      help: 'Assistant answers kept in the active window before paging.',
      def: 25,
      min: 5,
      max: 200,
      step: 5,
      unit: '',
      group: 'Window Size',
      getLive() { return getPaginationSetting('pwPageSize', 25); },
      setLive(v) { setPaginationSetting('pwPageSize', v); },
    },
    {
      type: 'range',
      key: 'pwBufferAnswers',
      label: 'Buffered Answers',
      help: 'Extra answers kept mounted around the active page for smoother context.',
      def: 10,
      min: 0,
      max: 80,
      step: 1,
      unit: '',
      group: 'Window Size',
      getLive() { return getPaginationSetting('pwBufferAnswers', 10); },
      setLive(v) { setPaginationSetting('pwBufferAnswers', v); },
    },
    {
      type: 'toggle',
      key: 'pwShortcutsEnabled',
      label: 'Enable Shortcuts',
      help: 'Alt+Up/Down/Home/End and Meta+Shift+Up/Down page controls.',
      def: true,
      group: 'Experience',
      getLive() { return getPaginationSetting('pwShortcutsEnabled', true); },
      setLive(v) { setPaginationSetting('pwShortcutsEnabled', !!v); },
    },
    {
      type: 'toggle',
      key: 'pwAutoLoadSentinel',
      label: 'Auto-load Sentinels',
      help: 'Automatically step pages when the top/bottom sentinels enter view.',
      def: false,
      group: 'Experience',
      getLive() { return getPaginationSetting('pwAutoLoadSentinel', false); },
      setLive(v) { setPaginationSetting('pwAutoLoadSentinel', !!v); },
    },
    {
      type: 'select',
      key: 'pwStyleMode',
      label: 'Sentinel Style',
      def: 'normal',
      opts: [['normal', 'Normal'], ['conservative', 'Conservative'], ['off', 'Off']],
      group: 'Rendering',
      getLive() { return getPaginationSetting('pwStyleMode', 'normal'); },
      setLive(v) { setPaginationSetting('pwStyleMode', v); },
    },
    {
      type: 'select',
      key: 'pwSwapMode',
      label: 'Swap Mode',
      help: 'Choose how the active window is swapped into the conversation root.',
      def: 'root',
      opts: [['root', 'Root Swap'], ['view', 'View Swap']],
      group: 'Rendering',
      getLive() { return getPaginationSetting('pwSwapMode', 'root'); },
      setLive(v) { setPaginationSetting('pwSwapMode', v); },
    },
    {
      type: 'toggle',
      key: 'pwDebug',
      label: 'Debug Logs',
      def: false,
      group: 'Diagnostics',
      getLive() { return getPaginationSetting('pwDebug', false); },
      setLive(v) { setPaginationSetting('pwDebug', !!v); },
    },
    {
      type: 'action',
      key: 'pwNavActions',
      label: 'Page Navigation',
      group: 'Actions',
      statusText: '',
      buttons: [
        { label: 'First', action: () => goPagination('first'), successText: 'Moved.', errorText: 'Navigation failed.' },
        { label: 'Older', action: () => goPagination('older'), successText: 'Moved.', errorText: 'Navigation failed.' },
        { label: 'Newer', action: () => goPagination('newer'), successText: 'Moved.', errorText: 'Navigation failed.' },
        { label: 'Last', action: () => goPagination('last'), successText: 'Moved.', errorText: 'Navigation failed.' },
      ],
    },
    {
      type: 'action',
      key: 'pwMaintenance',
      label: 'Maintenance',
      group: 'Actions',
      statusText: '',
      buttons: [
        {
          label: 'Rebuild Index',
          primary: true,
          action: () => rebuildPagination('control-hub:rebuild'),
          successText: 'Rebuilt.',
          errorText: 'Rebuild failed.',
        },
      ],
    },
  ];

  function register() {
    const api = getApi();
    if (!api?.registerPlugin) return false;
    if (api === LAST_API) return true;

    try {
      api.registerPlugin({
        key: 'chatMechanisms',
        getControls() {
          return CHAT_MECHANISMS_CONTROLS;
        },
      });
      api.registerPlugin({
        key: 'unmountMessages',
        getControls() {
          return UNMOUNT_CONTROLS;
        },
      });
      api.registerPlugin({
        key: 'paginationWindowing',
        getControls() {
          return PAGINATION_CONTROLS;
        },
      });
      LAST_API = api;
      bindLiveInvalidation();
      return true;
    } catch {}

    return false;
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
