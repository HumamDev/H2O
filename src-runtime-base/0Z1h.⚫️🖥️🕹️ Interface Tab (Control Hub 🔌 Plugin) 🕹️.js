// ==H2O Module==
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
// ==/H2O Module==

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

  // ----- Surface owner constants / shell metadata -------------------------
  const FEATURE_KEY_INTERFACE = 'interface';
  const FEATURE_KEY_CHAT_NAVIGATION = 'chatNavigation';
  const FEATURE_KEY_CHAT_LIST = 'interfaceEnhancer';
  const FEATURE_KEY_CHAT_META = 'chatMeta';
  const FEATURE_KEY_CHAT_TITLE = 'chatTitle';
  const FEATURE_KEY_TIMESTAMPS = 'interfaceTimestamps';
  const KEY_CHUB_INTERFACE_SUBTAB_V1 = 'h2o:prm:cgx:cntrlhb:state:interface:subtab:v1';
  const KEY_CHUB_TAB_VIS_V1 = 'h2o:prm:cgx:cntrlhb:state:tab-visibility:v1';
  const KEY_ANSN_CFG_UI_V1 = 'h2o:prm:cgx:ansn:cfg:ui:v1';
  const KEY_QN_CFG_UI_V1 = 'h2o:prm:cgx:qbig:cfg:ui:v1';
  const KEY_ATS_CFG_UI_V1 = 'h2o:prm:cgx:answrts:cfg:ui:v1';
  const KEY_AT_CFG_UI_V1 = 'h2o:prm:cgx:tnswrttl:cfg:ui:v1';
  const KEY_AE_EMPTY_BADGE_ICON_V1 = 'h2o:prm:cgx:tmjttl:state:empty-badge-icon:v1';
  const KEY_AE_PICKER_GROUPING_V1 = 'h2o:prm:cgx:tmjttl:state:picker-grouping:v1';
  const KEY_CHAT_LIST_ACTIVITY_STYLE_V1 = 'ho:chat-list-activity-style';
  const EV_AE_SETTINGS_CANON = 'evt:h2o:autoemoji:settings-changed';
  const EV_AE_SETTINGS_LEG = 'h2o:autoemoji:settings-changed';
  const EV_CHAT_LIST_ACTIVITY_STYLE = 'h2o:interface:activity-style';
  const DEFAULT_CHAT_LIST_ACTIVITY_STYLE = 'edge-strip';
  const CHAT_LIST_ACTIVITY_STYLE_OPTIONS = Object.freeze([
    Object.freeze(['edge-strip', 'Thin Edge Strip']),
    Object.freeze(['edge-wide', 'Wide Edge Strip']),
  ]);
  const DEFAULT_AE_EMPTY_BADGE_ICON = 'chat-bubble-stack';
  const DEFAULT_AE_PICKER_GROUPING = 'os';
  const AE_EMPTY_BADGE_ICON_OPTIONS = Object.freeze([
    Object.freeze(['message-circle', 'Message Circle']),
    Object.freeze(['message-square', 'Message Square']),
    Object.freeze(['chat-bubble-stack', 'Chat Stack']),
  ]);
  const AE_EMPTY_BADGE_ICON_KEYS = Object.freeze(AE_EMPTY_BADGE_ICON_OPTIONS.map(([icon]) => icon));
  const AE_PICKER_GROUPING_OPTIONS = Object.freeze([
    Object.freeze(['os', 'OS Emoji Categories']),
    Object.freeze(['internal', 'H2O Internal Groups']),
  ]);
  const AE_EMPTY_BADGE_ICON_MASKS = Object.freeze({
    'message-circle': "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.4A8.5 8.5 0 1 1 21 11.5Z'/%3E%3C/svg%3E",
    'message-square': "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z'/%3E%3C/svg%3E",
    'chat-bubble-stack': "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M8 15H6l-3 3V7a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4'/%3E%3Cpath fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M10 19h5l4 2v-7a3 3 0 0 0-3-3h-6a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3Z'/%3E%3C/svg%3E",
  });

  const INTERFACE_META = Object.freeze({
    key: FEATURE_KEY_INTERFACE,
    label: 'Interface',
    icon: '🖥️',
    subtitle: 'Chat list styling and sidebar cues.',
    category: 'mark',
    insertBefore: 'themes',
    description: Object.freeze({
      default: 'Keep chat-list styling and sidebar cues under one interface tab.',
      focus: 'Tune chat-list indicators without leaving interface controls.',
      review: 'Use interface controls to tune sidebar and project-list cues.',
      performance: 'Keep lightweight interface helpers grouped so UI tuning stays predictable.',
    }),
  });

  const INTERFACE_SUBTABS = Object.freeze([
    Object.freeze({
      key: FEATURE_KEY_CHAT_LIST,
      label: 'Chat List',
      icon: '🖥️',
      subtitle: 'Sidebar and project list color cues.',
      description: Object.freeze({
        default: 'Heat indicators, row colors, and active chat cues for chat lists.',
        focus: 'Spot recent chats and active rows faster.',
        review: 'Keep chat-list color cues separate from metadata and title state.',
        performance: 'Keep list decoration controls lightweight.',
      }),
    }),
    Object.freeze({
      key: FEATURE_KEY_CHAT_META,
      label: 'Chat Meta',
      icon: '🧾',
      subtitle: 'Created dates, answer counts, pin state, and previews.',
      description: Object.freeze({
        default: 'Review chat metadata enrichment state for list rows.',
        focus: 'Check whether the current chat metadata cache is available.',
        review: 'Keep list metadata, pinning, and preview status separate from list styling.',
        performance: 'Inspect metadata counts without opening the full chat list surface.',
      }),
    }),
    Object.freeze({
      key: FEATURE_KEY_CHAT_TITLE,
      label: 'Chat Title',
      icon: '🏷️',
      subtitle: 'Canonical title and emoji state for the current chat.',
      description: Object.freeze({
        default: 'Inspect and refresh the canonical chat-title state owner.',
        focus: 'Check the current chat title, emoji, and storage backend.',
        review: 'Keep page title state separate from sidebar metadata and list decoration.',
        performance: 'Refresh title state without rebuilding unrelated interface helpers.',
      }),
    }),
    Object.freeze({
      key: FEATURE_KEY_TIMESTAMPS,
      label: 'Timestamps',
      icon: '⏳',
      subtitle: 'Native ChatGPT conversation timestamps.',
      description: Object.freeze({
        default: 'Show or hide the timestamp markers the ChatGPT website renders inside conversations.',
        focus: 'Hide native middle-page timestamps without touching Cockpit Pro answer timestamps.',
        review: 'Native ChatGPT timestamps are controlled separately from H2O-owned answer timestamps.',
        performance: 'Hiding uses one root attribute and a bounded scanner — no per-node style churn.',
      }),
    }),
  ]);

  const TITLES_META = Object.freeze({
    key: 'titles',
    label: 'Titles',
    icon: '🏷️',
    subtitle: 'Title helpers for answers + chats.',
    category: 'nav',
    hidden: true,
    description: Object.freeze({
      default: 'Sync titles with MiniMap + cards.',
      focus: 'Keep labels legible.',
      review: 'Badge + tooltip helpers.',
      performance: 'Lightweight updates.',
    }),
  });

  const NUMBERS_META = Object.freeze({
    key: 'numbers',
    label: 'Numbers',
    icon: '🧮',
    subtitle: 'Answer + question number surfaces.',
    category: 'nav',
    hidden: true,
    description: Object.freeze({
      default: 'Tune answer and question number overlays from one place.',
      focus: 'Keep large number helpers readable without leaving navigation controls.',
      review: 'Adjust fade, offset, and size for title/number helpers while scanning long chats.',
      performance: 'Keep number overlays legible while controlling how strong their visual footprint is.',
    }),
  });

  const INTERFACE_VISIBILITY = Object.freeze({
    hideCss: `
__ROOT__ .ho-colorbtn,
__ROOT__ .ho-palette,
__ROOT__ .ho-meta-row,
__ROOT__ .ho-meta-actions-right,
__ROOT__ .ho-meta-action,
__ROOT__ #ho-preview-tip{
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

  // ----- Visibility ownership + host API discovery ------------------------
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

  // ----- Owner helpers -----------------------------------------------------
  function invalidate(api = LAST_API) {
    if (!api || typeof api.invalidate !== 'function') return;
    try { W.setTimeout(() => api.invalidate(), 0); } catch {}
  }

  function interfaceCssText() {
    return `
.${CLS}-aeIconPicker{
  display:grid;
  grid-template-columns:repeat(auto-fit, minmax(142px, 1fr));
  gap:6px;
  width:100%;
  margin-top:8px;
}
.${CLS}-aeIconOption{
  appearance:none;
  display:flex;
  align-items:center;
  gap:8px;
  min-height:34px;
  padding:7px 9px;
  border:1px solid rgba(255,255,255,.12);
  border-radius:8px;
  background:rgba(255,255,255,.045);
  color:inherit;
  cursor:pointer;
  text-align:left;
  font:600 12px/1.2 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  letter-spacing:0;
}
.${CLS}-aeIconOption:hover{
  background:rgba(255,255,255,.08);
  border-color:rgba(255,255,255,.20);
}
.${CLS}-aeIconOption[aria-pressed="true"]{
  background:rgba(132,198,255,.16);
  border-color:rgba(132,198,255,.36);
  box-shadow:0 0 0 1px rgba(132,198,255,.12), inset 0 1px 0 rgba(255,255,255,.10);
}
.${CLS}-aeIconOptionIcon{
  display:inline-flex;
  flex:0 0 18px;
  width:18px;
  height:18px;
  background:rgba(230,240,255,.92);
  -webkit-mask:var(--h2o-ae-icon-mask) center / contain no-repeat;
  mask:var(--h2o-ae-icon-mask) center / contain no-repeat;
  filter:drop-shadow(0 0 8px rgba(132,198,255,.32));
}
.${CLS}-aeIconOption[aria-pressed="true"] .${CLS}-aeIconOptionIcon{
  background:rgba(255,255,255,.98);
  filter:drop-shadow(0 0 10px rgba(132,198,255,.55));
}
.${CLS}-aeIconOptionLabel{
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
`;
  }

  function applySkin(api) {
    let skin = null;
    try { skin = typeof api?.getSkin === 'function' ? api.getSkin() : null; } catch {}
    CLS = skin?.CLS || CLS;
  }

  // ----- Controls bundle boundary -----------------------------------------
  const EMPTY_INTERFACE_CONTROLS_BUNDLE = Object.freeze({
    controlsByKey: Object.freeze({
      [FEATURE_KEY_CHAT_LIST]: Object.freeze([]),
      [FEATURE_KEY_CHAT_META]: Object.freeze([]),
      [FEATURE_KEY_CHAT_TITLE]: Object.freeze([]),
      [FEATURE_KEY_TIMESTAMPS]: Object.freeze([]),
      titles: Object.freeze([]),
      numbers: Object.freeze([]),
    }),
    titlesMeta: TITLES_META,
    numbersMeta: NUMBERS_META,
  });

  function getInterfaceControlsProvider() {
    return H2O.Surface?.InterfaceControls || null;
  }

  function getInterfaceControlsBundle() {
    const bundle = safeCall('interfaceControls.getBundle', () => getInterfaceControlsProvider()?.getBundle?.());
    if (!bundle || typeof bundle !== 'object') return EMPTY_INTERFACE_CONTROLS_BUNDLE;
    if (!bundle.controlsByKey || typeof bundle.controlsByKey !== 'object') return EMPTY_INTERFACE_CONTROLS_BUNDLE;
    return bundle;
  }

  function refreshInterfaceControls(key = FEATURE_KEY_INTERFACE) {
    const api = getApi();
    if (!api || typeof api.refreshControls !== 'function') return false;
    return !!safeCall(`interface.refreshControls:${String(key || FEATURE_KEY_INTERFACE)}`, () => api.refreshControls(key || FEATURE_KEY_INTERFACE));
  }

  function replayInterfaceActiveDetail(key = FEATURE_KEY_INTERFACE) {
    const api = getApi();
    if (!api || typeof api.replayActiveDetail !== 'function') return false;
    return !!safeCall(`interface.replayActiveDetail:${String(key || FEATURE_KEY_INTERFACE)}`, () => api.replayActiveDetail(key || FEATURE_KEY_INTERFACE));
  }

  function replayInterfaceOpenPanel(key = FEATURE_KEY_INTERFACE) {
    const api = getApi();
    if (!api || typeof api.replayOpenPanel !== 'function') return false;
    return !!safeCall(`interface.replayOpenPanel:${String(key || FEATURE_KEY_INTERFACE)}`, () => api.replayOpenPanel(key || FEATURE_KEY_INTERFACE));
  }

  function getInterfaceOwnerApi() {
    return Object.freeze({
      version: 1,
      ownerReady: true,
      getHostApi: getApi,
      invalidate,
      replayOpenPanel: (key = FEATURE_KEY_INTERFACE) => replayInterfaceOpenPanel(key),
      replayActiveDetail: (key = FEATURE_KEY_INTERFACE) => replayInterfaceActiveDetail(key),
      refreshControls: (key = FEATURE_KEY_INTERFACE) => refreshInterfaceControls(key),
      getSkinClass: () => CLS,
      getMeta: () => INTERFACE_META,
      getSubtabs: () => INTERFACE_SUBTABS,
      getSubtabStorageKey: () => KEY_CHUB_INTERFACE_SUBTAB_V1,
      getVisibilitySpec: () => INTERFACE_VISIBILITY,
      getControlsBundle: getInterfaceControlsBundle,
    });
  }

  H2O.Surface = H2O.Surface || {};
  H2O.Surface.Interface = getInterfaceOwnerApi();

  // ----- Registration ------------------------------------------------------
  function registerInterfaceShell(api) {
    api.registerPlugin({
      key: FEATURE_KEY_INTERFACE,
      title: 'Interface',
      meta: INTERFACE_META,
      category: 'mark',
      subtabs: INTERFACE_SUBTABS,
      subtabStorageKey: KEY_CHUB_INTERFACE_SUBTAB_V1,
      cssText: interfaceCssText,
      visibility: INTERFACE_VISIBILITY,
    });
  }

  function registerInterfaceControls(api) {
    api.registerPlugin({
      key: FEATURE_KEY_CHAT_LIST,
      getControls() {
        return getInterfaceControlsBundle().controlsByKey[FEATURE_KEY_CHAT_LIST] || [];
      },
    });
    api.registerPlugin({
      key: FEATURE_KEY_CHAT_META,
      getControls() {
        return getInterfaceControlsBundle().controlsByKey[FEATURE_KEY_CHAT_META] || [];
      },
    });
    api.registerPlugin({
      key: FEATURE_KEY_CHAT_TITLE,
      getControls() {
        return getInterfaceControlsBundle().controlsByKey[FEATURE_KEY_CHAT_TITLE] || [];
      },
    });
    api.registerPlugin({
      key: FEATURE_KEY_TIMESTAMPS,
      getControls() {
        return getInterfaceControlsBundle().controlsByKey[FEATURE_KEY_TIMESTAMPS] || [];
      },
    });
    const bundle = getInterfaceControlsBundle();
    api.registerPlugin({
      key: 'titles',
      meta: bundle.titlesMeta || TITLES_META,
      category: 'nav',
      getControls() {
        return getInterfaceControlsBundle().controlsByKey.titles || [];
      },
    });
    api.registerPlugin({
      key: 'numbers',
      meta: bundle.numbersMeta || NUMBERS_META,
      category: 'nav',
      getControls() {
        return getInterfaceControlsBundle().controlsByKey.numbers || [];
      },
    });
  }

  function register() {
    const api = getApi();
    if (!api?.registerPlugin) return false;
    if (api === LAST_API) return true;

    try {
      applySkin(api);
      registerInterfaceShell(api);
      registerInterfaceControls(api);
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
