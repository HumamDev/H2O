// ==UserScript==
// @h2o-id             0z1h.interface.tab.control.hub.plugin
// @name               0Z1h.⚫️🖥️🕹️ Interface Tab (Control Hub 🔌 Plugin) 🕹️
// @namespace          H2O.Premium.CGX.interface.tab.control.hub.plugin
// @author             HumamDev
// @version            0.1.0
// @revision           001
// @build              260505-000000
// @description        Registers the Interface tab controls into Control Hub via plugin API.
// @match              https://chatgpt.com/*
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
  const MARK = '__H2O_CHUB_INTERFACE_TAB_PLUGIN_V010__';

  if (W[MARK]) return;
  W[MARK] = true;

  let LAST_API = null;
  let CLS = 'cgxui-cnhb';

  const FEATURE_KEY_INTERFACE = 'interface';
  const KEY_CHUB_INTERFACE_SUBTAB_V1 = 'h2o:prm:cgx:cntrlhb:state:interface:subtab:v1';
  const KEY_CHUB_TAB_VIS_V1 = 'h2o:prm:cgx:cntrlhb:state:tab-visibility:v1';
  const KEY_ANSN_CFG_UI_V1 = 'h2o:prm:cgx:ansn:cfg:ui:v1';
  const KEY_QN_CFG_UI_V1 = 'h2o:prm:cgx:qbig:cfg:ui:v1';
  const KEY_ATS_CFG_UI_V1 = 'h2o:prm:cgx:answrts:cfg:ui:v1';
  const KEY_AT_CFG_UI_V1 = 'h2o:prm:cgx:tnswrttl:cfg:ui:v1';

  const INTERFACE_META = Object.freeze({
    key: FEATURE_KEY_INTERFACE,
    label: 'Interface',
    icon: '🖥️',
    subtitle: 'Chat list styling plus title helper surfaces.',
    category: 'mark',
    insertBefore: 'themes',
    description: Object.freeze({
      default: 'Keep interface styling and title helpers under one interface tab.',
      focus: 'Switch between chat-list indicators and title helpers without leaving interface controls.',
      review: 'Use interface sub-tabs to tune labels and sidebar cues separately.',
      performance: 'Keep lightweight interface helpers grouped so UI tuning stays predictable.',
    }),
  });

  const INTERFACE_SUBTABS = Object.freeze([
    Object.freeze({
      key: 'interfaceEnhancer',
      label: 'Interface Enhancer',
      icon: '🖥️',
      subtitle: 'Sidebar + project list color dots.',
      description: Object.freeze({
        default: 'Heatmap-style indicators for chats.',
        focus: 'Spot recent chats faster.',
        review: 'Quick color toggles near chat links.',
        performance: 'Small DOM footprint.',
      }),
    }),
    Object.freeze({
      key: 'titles',
      label: 'Titles',
      icon: '🏷️',
      subtitle: 'Title helpers for answers + chats.',
      description: Object.freeze({
        default: 'Sync titles with MiniMap + cards.',
        focus: 'Keep labels legible.',
        review: 'Badge + tooltip helpers.',
        performance: 'Lightweight updates.',
      }),
    }),
    Object.freeze({
      key: 'numbers',
      label: 'Numbers',
      icon: '🧮',
      subtitle: 'Answer + question number surfaces.',
      description: Object.freeze({
        default: 'Tune answer and question number overlays from one place.',
        focus: 'Keep large number helpers readable without leaving interface controls.',
        review: 'Adjust fade, offset, and size for title/number helpers while scanning long chats.',
        performance: 'Keep number overlays legible while controlling how strong their visual footprint is.',
      }),
    }),
  ]);

  const INTERFACE_VISIBILITY = Object.freeze({
    hideCss: `
__ROOT__ .ho-colorbtn,
__ROOT__ .ho-palette,
__ROOT__ .ho-meta-row,
__ROOT__ .ho-meta-actions-right,
__ROOT__ .ho-meta-action,
__ROOT__ #ho-preview-tip,
__ROOT__ .ho-tab-title-under-input,
__ROOT__ .ho-sidebar-ring{
  display:none !important;
}
__ROOT__ a.ho-has-colorbtn,
__ROOT__ .ho-main-row,
__ROOT__ nav a.ho-project-row,
__ROOT__ :where(nav, aside) .ho-seeall{
  background:none !important;
  background-color:transparent !important;
  box-shadow:none !important;
  border-color:transparent !important;
  filter:none !important;
  backdrop-filter:none !important;
  -webkit-backdrop-filter:none !important;
}
__ROOT__ a.ho-has-colorbtn::before,
__ROOT__ a.ho-has-colorbtn::after,
__ROOT__ .ho-main-row::before,
__ROOT__ .ho-main-row::after,
__ROOT__ nav a.ho-project-row::before,
__ROOT__ nav a.ho-project-row::after,
__ROOT__ :where(nav, aside) .ho-seeall::before,
__ROOT__ :where(nav, aside) .ho-seeall::after{
  content:none !important;
  display:none !important;
}
`,
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

  function safeCall(label, fn) {
    try { return fn(); } catch (error) { try { console.warn('[H2O InterfaceTab] ' + label, error); } catch {} }
    return undefined;
  }

  function invalidate(api = LAST_API) {
    if (!api || typeof api.invalidate !== 'function') return;
    try { W.setTimeout(() => api.invalidate(), 0); } catch {}
  }

  function applySkin(api) {
    let skin = null;
    try { skin = typeof api?.getSkin === 'function' ? api.getSkin() : null; } catch {}
    CLS = skin?.CLS || CLS;
  }

  const storage = {
    getStr(key, fallback = null) {
      try {
        const store = TOPW.localStorage || W.localStorage;
        return store.getItem(key) ?? fallback;
      } catch {
        return fallback;
      }
    },
    setJSON(key, obj) {
      try {
        const store = TOPW.localStorage || W.localStorage;
        store.setItem(key, JSON.stringify(obj));
        return true;
      } catch {
        return false;
      }
    },
    getJSON(key, fallback = null) {
      const s = this.getStr(key, null);
      if (s == null) return fallback;
      try { return JSON.parse(s); } catch { return fallback; }
    },
  };

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

  function CHUB_INTERFACE_isVisible() {
    const state = storage.getJSON(KEY_CHUB_TAB_VIS_V1, {}) || {};
    return state[FEATURE_KEY_INTERFACE] !== false;
  }

  function CHUB_ANSN_api() {
    return TOPW.H2O?.AnsNums?.api || W.H2O?.AnsNums?.api || null;
  }

  function CHUB_ANSN_normalizeConfig(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const clamp = (v, min, max, fallback) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    };
    const legacyFadeStrength = clamp(src.rightFadeStrength, 0.0, 1.0, 0.65);
    const legacyFadeStartPct = 68 - (50 * legacyFadeStrength);
    const legacyFadeEndOpacity = clamp(src.rightFadeEndOpacity, 0.0, 1.0, 0.0);
    return {
      normalOpacity: clamp(src.normalOpacity, 0.02, 0.35, 0.12),
      normalLeftPx: clamp(src.normalLeftPx, -260, -20, -140),
      normalScale: clamp(src.normalScale, 0.55, 1.35, 1.0),
      normalRightFadeStartPct: clamp(src.normalRightFadeStartPct, 20, 100, legacyFadeStartPct),
      normalRightFadeEndOpacity: clamp(src.normalRightFadeEndOpacity, 0.0, 1.0, legacyFadeEndOpacity),
      collapsedOpacity: clamp(src.collapsedOpacity, 0.02, 0.35, 0.09),
      collapsedScale: clamp(src.collapsedScale, 0.2, 1.1, 0.42),
      collapsedLeftPx: clamp(src.collapsedLeftPx, -260, -20, -132),
      collapsedRightFadeStartPct: clamp(src.collapsedRightFadeStartPct, 20, 100, legacyFadeStartPct),
      collapsedRightFadeEndOpacity: clamp(src.collapsedRightFadeEndOpacity, 0.0, 1.0, legacyFadeEndOpacity),
    };
  }

  function CHUB_ANSN_readStore() {
    try { return CHUB_ANSN_normalizeConfig(storage.getJSON(KEY_ANSN_CFG_UI_V1, {}) || {}); } catch { return CHUB_ANSN_normalizeConfig(null); }
  }

  function CHUB_ANSN_writeStore(next) {
    const cfg = CHUB_ANSN_normalizeConfig(next);
    storage.setJSON(KEY_ANSN_CFG_UI_V1, cfg);
    return cfg;
  }

  function CHUB_ANSN_getConfig() {
    const api = CHUB_ANSN_api();
    if (api && typeof api.getConfig === 'function') {
      try { return CHUB_ANSN_normalizeConfig(api.getConfig()); } catch {}
    }
    return CHUB_ANSN_readStore();
  }

  function CHUB_ANSN_applySetting(key, value) {
    const api = CHUB_ANSN_api();
    if (api && typeof api.applySetting === 'function') {
      try { return CHUB_ANSN_normalizeConfig(api.applySetting(key, value)); } catch {}
    }
    const merged = CHUB_ANSN_normalizeConfig({ ...CHUB_ANSN_readStore(), [key]: value });
    CHUB_ANSN_writeStore(merged);
    return merged;
  }

  function CHUB_ANSN_rescan() {
    return safeCall('answerNumbers.rescan', () => CHUB_ANSN_api()?.rescan?.());
  }

  function CHUB_QN_api() {
    return TOPW.H2O?.QN?.qbigindex?.api || W.H2O?.QN?.qbigindex?.api || null;
  }

  function CHUB_QN_normalizeConfig(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const clamp = (v, min, max, fallback) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    };
    return {
      opacity: clamp(src.opacity, 0.02, 0.35, 0.12),
      leftOffsetPx: clamp(src.leftOffsetPx, 0, 120, 14),
      scale: clamp(src.scale, 0.35, 1.35, 0.75),
      rightFadeStartPct: clamp(src.rightFadeStartPct, 20, 100, 60),
      rightFadeEndOpacity: clamp(src.rightFadeEndOpacity, 0.0, 1.0, 0.18),
    };
  }

  function CHUB_QN_readStore() {
    try { return CHUB_QN_normalizeConfig(storage.getJSON(KEY_QN_CFG_UI_V1, {}) || {}); } catch { return CHUB_QN_normalizeConfig(null); }
  }

  function CHUB_QN_writeStore(next) {
    const cfg = CHUB_QN_normalizeConfig(next);
    storage.setJSON(KEY_QN_CFG_UI_V1, cfg);
    return cfg;
  }

  function CHUB_QN_getConfig() {
    const api = CHUB_QN_api();
    if (api && typeof api.getConfig === 'function') {
      try { return CHUB_QN_normalizeConfig(api.getConfig()); } catch {}
    }
    return CHUB_QN_readStore();
  }

  function CHUB_QN_applySetting(key, value) {
    const api = CHUB_QN_api();
    if (api && typeof api.applySetting === 'function') {
      try { return CHUB_QN_normalizeConfig(api.applySetting(key, value)); } catch {}
    }
    const merged = CHUB_QN_normalizeConfig({ ...CHUB_QN_readStore(), [key]: value });
    CHUB_QN_writeStore(merged);
    return merged;
  }

  function CHUB_QN_rescan() {
    return safeCall('questionNumbers.rescan', () => CHUB_QN_api()?.rescan?.());
  }

  function CHUB_ATS_api() {
    return TOPW.H2O?.AT?.answrts?.api || W.H2O?.AT?.answrts?.api || null;
  }

  function CHUB_ATS_normalizeConfig(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const mode = String(src.collapsedHoverMode || 'under').trim().toLowerCase();
    return {
      collapsedHoverMode: ['under', 'tooltip', 'title-right'].includes(mode) ? mode : 'under',
    };
  }

  function CHUB_ATS_readStore() {
    try { return CHUB_ATS_normalizeConfig(storage.getJSON(KEY_ATS_CFG_UI_V1, {}) || {}); } catch { return CHUB_ATS_normalizeConfig(null); }
  }

  function CHUB_ATS_writeStore(next) {
    const cfg = CHUB_ATS_normalizeConfig(next);
    storage.setJSON(KEY_ATS_CFG_UI_V1, cfg);
    return cfg;
  }

  function CHUB_ATS_getConfig() {
    const api = CHUB_ATS_api();
    if (api && typeof api.getConfig === 'function') {
      try { return CHUB_ATS_normalizeConfig(api.getConfig()); } catch {}
    }
    return CHUB_ATS_readStore();
  }

  function CHUB_ATS_applySetting(key, value) {
    const api = CHUB_ATS_api();
    if (api && typeof api.applySetting === 'function') {
      try { return CHUB_ATS_normalizeConfig(api.applySetting(key, value)); } catch {}
    }
    const merged = CHUB_ATS_normalizeConfig({ ...CHUB_ATS_readStore(), [key]: value });
    CHUB_ATS_writeStore(merged);
    return merged;
  }

  function CHUB_ATS_hoverModeOpts() {
    return [
      ['under', 'Under Title Bar'],
      ['tooltip', 'Hover Info Box'],
      ['title-right', 'Right Side Of Title Bar'],
    ];
  }

  function CHUB_AT_api() {
    return TOPW.H2O?.AT?.tnswrttl?.api || W.H2O?.AT?.tnswrttl?.api || null;
  }

  function CHUB_AT_normalizeConfig(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const mode = String(src.collapsedTextMode || 'adaptive').trim().toLowerCase();
    return {
      collapsedTextMode: ['adaptive', 'consistent'].includes(mode) ? mode : 'adaptive',
    };
  }

  function CHUB_AT_readStore() {
    try { return CHUB_AT_normalizeConfig(storage.getJSON(KEY_AT_CFG_UI_V1, {}) || {}); } catch { return CHUB_AT_normalizeConfig(null); }
  }

  function CHUB_AT_writeStore(next) {
    const cfg = CHUB_AT_normalizeConfig(next);
    storage.setJSON(KEY_AT_CFG_UI_V1, cfg);
    return cfg;
  }

  function CHUB_AT_getConfig() {
    const api = CHUB_AT_api();
    if (api && typeof api.getConfig === 'function') {
      try { return CHUB_AT_normalizeConfig(api.getConfig()); } catch {}
    }
    return CHUB_AT_readStore();
  }

  function CHUB_AT_applySetting(key, value) {
    const api = CHUB_AT_api();
    if (api && typeof api.applySetting === 'function') {
      try { return CHUB_AT_normalizeConfig(api.applySetting(key, value)); } catch {}
    }
    const merged = CHUB_AT_normalizeConfig({ ...CHUB_AT_readStore(), [key]: value });
    CHUB_AT_writeStore(merged);
    return merged;
  }

  function CHUB_AT_collapsedTextModeOpts() {
    return [
      ['adaptive', 'Adaptive (Flip Black/White)'],
      ['consistent', 'Consistent (Same Color)'],
    ];
  }

  const INTERFACE_ENHANCER_CONTROLS = Object.freeze([
    {
      type: 'custom',
      key: 'interfaceState',
      label: 'Interface Enhancer',
      group: 'Visibility',
      render() {
        return renderInfoList([
          { label: 'State', value: CHUB_INTERFACE_isVisible() ? 'Visible' : 'Hidden' },
          { label: 'Hint', value: 'Use the row switch to show or hide Interface surfaces on the page.' },
        ]);
      },
    },
  ]);

  const TITLES_CONTROLS = Object.freeze([
    {
      type: 'custom',
      key: 'titlesState',
      label: 'Titles',
      group: 'Visibility',
      render() {
        return renderInfoList([
          { label: 'State', value: CHUB_INTERFACE_isVisible() ? 'Visible' : 'Hidden' },
          { label: 'Hint', value: 'Use the row switch to show or hide the active title helper surface.' },
        ]);
      },
    },
    {
      type: 'select',
      key: 'atCollapsedTextMode',
      label: 'Collapsed Title Text Color',
      group: 'Titles',
      help: 'Choose whether collapsed title text adapts per wash color or stays consistent across all collapsed title bars.',
      def: 'adaptive',
      opts: CHUB_AT_collapsedTextModeOpts,
      getLive() { return CHUB_AT_getConfig().collapsedTextMode || 'adaptive'; },
      setLive(v) { CHUB_AT_applySetting('collapsedTextMode', v); },
    },
    {
      type: 'select',
      key: 'atsCollapsedHoverMode',
      label: 'Collapsed Hover Timestamp',
      group: 'Timestamps',
      help: 'When a title bar is collapsed, choose how the timestamp appears while hovering the title bar.',
      def: 'under',
      opts: CHUB_ATS_hoverModeOpts,
      getLive() { return CHUB_ATS_getConfig().collapsedHoverMode || 'under'; },
      setLive(v) { CHUB_ATS_applySetting('collapsedHoverMode', v); },
    },
  ]);

  const NUMBERS_CONTROLS = Object.freeze([
    {
      type: 'range',
      key: 'ansnNormalOpacity',
      label: 'Big Number Fade',
      group: 'Answers Before Collapse',
      help: 'Controls how faded the expanded answer numbers look.',
      def: 0.12,
      min: 0.02,
      max: 0.35,
      step: 0.01,
      unit: '',
      getLive() { return Number(CHUB_ANSN_getConfig().normalOpacity || 0.12); },
      setLive(v) { CHUB_ANSN_applySetting('normalOpacity', v); CHUB_ANSN_rescan(); },
    },
    {
      type: 'range',
      key: 'ansnNormalLeftPx',
      label: 'Big Number Left Offset',
      group: 'Answers Before Collapse',
      help: 'Moves the expanded answer number farther left or closer to the answer block.',
      def: -140,
      min: -260,
      max: -20,
      step: 2,
      unit: 'px',
      getLive() { return Number(CHUB_ANSN_getConfig().normalLeftPx || -140); },
      setLive(v) { CHUB_ANSN_applySetting('normalLeftPx', v); CHUB_ANSN_rescan(); },
    },
    {
      type: 'range',
      key: 'ansnNormalScale',
      label: 'Big Number Size',
      group: 'Answers Before Collapse',
      help: 'Scales the expanded answer number without changing the answer content itself.',
      def: 1.00,
      min: 0.55,
      max: 1.35,
      step: 0.01,
      unit: '',
      getLive() { return Number(CHUB_ANSN_getConfig().normalScale || 1); },
      setLive(v) { CHUB_ANSN_applySetting('normalScale', v); CHUB_ANSN_rescan(); },
    },
    {
      type: 'range',
      key: 'ansnNormalRightFadeStartPct',
      label: 'Right Fade Cutoff',
      group: 'Answers Before Collapse',
      help: 'Moves where the right-side fade starts. Higher starts the fade later and keeps more of multi-digit values visible.',
      def: 56,
      min: 20,
      max: 100,
      step: 1,
      unit: '%',
      getLive() { return Number(CHUB_ANSN_getConfig().normalRightFadeStartPct || 56); },
      setLive(v) { CHUB_ANSN_applySetting('normalRightFadeStartPct', v); CHUB_ANSN_rescan(); },
    },
    {
      type: 'range',
      key: 'ansnNormalRightFadeEndOpacity',
      label: 'Right Fade End Opacity',
      group: 'Answers Before Collapse',
      help: 'Sets how visible the far-right edge remains after the fade.',
      def: 0.12,
      min: 0.00,
      max: 1.00,
      step: 0.01,
      unit: '',
      getLive() { return Number(CHUB_ANSN_getConfig().normalRightFadeEndOpacity || 0.12); },
      setLive(v) { CHUB_ANSN_applySetting('normalRightFadeEndOpacity', v); CHUB_ANSN_rescan(); },
    },
    {
      type: 'range',
      key: 'ansnCollapsedOpacity',
      label: 'Big Number Fade',
      group: 'Answers After Collapse',
      help: 'Controls how faded the collapsed answer numbers look.',
      def: 0.09,
      min: 0.02,
      max: 0.35,
      step: 0.01,
      unit: '',
      getLive() { return Number(CHUB_ANSN_getConfig().collapsedOpacity || 0.09); },
      setLive(v) { CHUB_ANSN_applySetting('collapsedOpacity', v); CHUB_ANSN_rescan(); },
    },
    {
      type: 'range',
      key: 'ansnCollapsedLeftPx',
      label: 'Big Number Left Offset',
      group: 'Answers After Collapse',
      help: 'Moves the collapsed answer number farther left or closer to the title list.',
      def: -132,
      min: -260,
      max: -20,
      step: 2,
      unit: 'px',
      getLive() { return Number(CHUB_ANSN_getConfig().collapsedLeftPx || -132); },
      setLive(v) { CHUB_ANSN_applySetting('collapsedLeftPx', v); CHUB_ANSN_rescan(); },
    },
    {
      type: 'range',
      key: 'ansnCollapsedScale',
      label: 'Big Number Size',
      group: 'Answers After Collapse',
      help: 'Adjusts how large the answer number remains after the title bar is collapsed.',
      def: 0.42,
      min: 0.20,
      max: 1.10,
      step: 0.01,
      unit: '',
      getLive() { return Number(CHUB_ANSN_getConfig().collapsedScale || 0.42); },
      setLive(v) { CHUB_ANSN_applySetting('collapsedScale', v); CHUB_ANSN_rescan(); },
    },
    {
      type: 'range',
      key: 'ansnCollapsedRightFadeStartPct',
      label: 'Right Fade Cutoff',
      group: 'Answers After Collapse',
      help: 'Moves where the right-side fade starts for collapsed answer numbers.',
      def: 70,
      min: 20,
      max: 100,
      step: 1,
      unit: '%',
      getLive() { return Number(CHUB_ANSN_getConfig().collapsedRightFadeStartPct || 70); },
      setLive(v) { CHUB_ANSN_applySetting('collapsedRightFadeStartPct', v); CHUB_ANSN_rescan(); },
    },
    {
      type: 'range',
      key: 'ansnCollapsedRightFadeEndOpacity',
      label: 'Right Fade End Opacity',
      group: 'Answers After Collapse',
      help: 'Sets how visible the far-right edge remains for collapsed answer numbers.',
      def: 0.18,
      min: 0.00,
      max: 1.00,
      step: 0.01,
      unit: '',
      getLive() { return Number(CHUB_ANSN_getConfig().collapsedRightFadeEndOpacity || 0.18); },
      setLive(v) { CHUB_ANSN_applySetting('collapsedRightFadeEndOpacity', v); CHUB_ANSN_rescan(); },
    },
    {
      type: 'range',
      key: 'qnOpacity',
      label: 'Big Number Fade',
      group: 'Questions',
      help: 'Controls how faded the question numbers look.',
      def: 0.12,
      min: 0.02,
      max: 0.35,
      step: 0.01,
      unit: '',
      getLive() { return Number(CHUB_QN_getConfig().opacity || 0.12); },
      setLive(v) { CHUB_QN_applySetting('opacity', v); CHUB_QN_rescan(); },
    },
    {
      type: 'range',
      key: 'qnLeftOffsetPx',
      label: 'Big Number Left Offset',
      group: 'Questions',
      help: 'Moves the question number farther left from the question bubble or closer to it.',
      def: 14,
      min: 0,
      max: 120,
      step: 1,
      unit: 'px',
      getLive() { return Number(CHUB_QN_getConfig().leftOffsetPx || 14); },
      setLive(v) { CHUB_QN_applySetting('leftOffsetPx', v); CHUB_QN_rescan(); },
    },
    {
      type: 'range',
      key: 'qnScale',
      label: 'Big Number Size',
      group: 'Questions',
      help: 'Scales the question number without changing the question bubble itself.',
      def: 0.75,
      min: 0.35,
      max: 1.35,
      step: 0.01,
      unit: '',
      getLive() { return Number(CHUB_QN_getConfig().scale || 0.75); },
      setLive(v) { CHUB_QN_applySetting('scale', v); CHUB_QN_rescan(); },
    },
    {
      type: 'range',
      key: 'qnRightFadeStartPct',
      label: 'Right Fade Cutoff',
      group: 'Questions',
      help: 'Moves where the right-side fade starts for question numbers.',
      def: 60,
      min: 20,
      max: 100,
      step: 1,
      unit: '%',
      getLive() { return Number(CHUB_QN_getConfig().rightFadeStartPct || 60); },
      setLive(v) { CHUB_QN_applySetting('rightFadeStartPct', v); CHUB_QN_rescan(); },
    },
    {
      type: 'range',
      key: 'qnRightFadeEndOpacity',
      label: 'Right Fade End Opacity',
      group: 'Questions',
      help: 'Sets how visible the far-right edge remains for question numbers.',
      def: 0.18,
      min: 0.00,
      max: 1.00,
      step: 0.01,
      unit: '',
      getLive() { return Number(CHUB_QN_getConfig().rightFadeEndOpacity || 0.18); },
      setLive(v) { CHUB_QN_applySetting('rightFadeEndOpacity', v); CHUB_QN_rescan(); },
    },
  ]);

  const CONTROLS_BY_KEY = Object.freeze({
    interfaceEnhancer: INTERFACE_ENHANCER_CONTROLS,
    titles: TITLES_CONTROLS,
    numbers: NUMBERS_CONTROLS,
  });

  function register() {
    const api = getApi();
    if (!api?.registerPlugin) return false;
    if (api === LAST_API) return true;

    try {
      applySkin(api);
      api.registerPlugin({
        key: FEATURE_KEY_INTERFACE,
        title: 'Interface',
        meta: INTERFACE_META,
        category: 'mark',
        subtabs: INTERFACE_SUBTABS,
        subtabStorageKey: KEY_CHUB_INTERFACE_SUBTAB_V1,
        visibility: INTERFACE_VISIBILITY,
      });
      api.registerPlugin({
        key: 'interfaceEnhancer',
        getControls() {
          return CONTROLS_BY_KEY.interfaceEnhancer;
        },
      });
      api.registerPlugin({
        key: 'titles',
        getControls() {
          return CONTROLS_BY_KEY.titles;
        },
      });
      api.registerPlugin({
        key: 'numbers',
        getControls() {
          return CONTROLS_BY_KEY.numbers;
        },
      });
      LAST_API = api;
      invalidate(api);
      return true;
    } catch (error) {
      try { console.warn('[H2O InterfaceTab] register failed', error); } catch {}
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
