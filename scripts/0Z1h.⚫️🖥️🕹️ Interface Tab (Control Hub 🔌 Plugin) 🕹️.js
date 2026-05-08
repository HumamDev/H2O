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
  const FEATURE_KEY_CHAT_NAVIGATION = 'chatNavigation';
  const FEATURE_KEY_CHAT_LIST = 'interfaceEnhancer';
  const FEATURE_KEY_CHAT_META = 'chatMeta';
  const FEATURE_KEY_CHAT_TITLE = 'chatTitle';
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

  function CHUB_TITLES_isVisible() {
    const state = storage.getJSON(KEY_CHUB_TAB_VIS_V1, {}) || {};
    return state[FEATURE_KEY_CHAT_NAVIGATION] !== false;
  }

  function CHUB_INTERFACE_api() {
    return TOPW.H2O?.interface || W.H2O?.interface || null;
  }

  function CHUB_CHAT_LIST_activityStyleOpts() {
    return CHAT_LIST_ACTIVITY_STYLE_OPTIONS.map(([key, label]) => [key, label]);
  }

  function CHUB_CHAT_LIST_normalizeActivityStyle(value) {
    const key = String(value || '').trim().toLowerCase();
    return CHAT_LIST_ACTIVITY_STYLE_OPTIONS.some(([opt]) => opt === key) ? key : DEFAULT_CHAT_LIST_ACTIVITY_STYLE;
  }

  function CHUB_CHAT_LIST_activityStyleLabel(value) {
    const key = CHUB_CHAT_LIST_normalizeActivityStyle(value);
    return CHAT_LIST_ACTIVITY_STYLE_OPTIONS.find(([opt]) => opt === key)?.[1] || 'Thin Edge Strip';
  }

  function CHUB_CHAT_LIST_getActivityStyle() {
    const api = CHUB_INTERFACE_api();
    try {
      if (typeof api?.store?.getActivityStyle === 'function') {
        return CHUB_CHAT_LIST_normalizeActivityStyle(api.store.getActivityStyle());
      }
    } catch {}
    return CHUB_CHAT_LIST_normalizeActivityStyle(storage.getStr(KEY_CHAT_LIST_ACTIVITY_STYLE_V1, DEFAULT_CHAT_LIST_ACTIVITY_STYLE));
  }

  function CHUB_CHAT_LIST_setActivityStyle(value) {
    let next = CHUB_CHAT_LIST_normalizeActivityStyle(value);
    const api = CHUB_INTERFACE_api();
    try {
      if (typeof api?.store?.setActivityStyle === 'function') {
        next = CHUB_CHAT_LIST_normalizeActivityStyle(api.store.setActivityStyle(next));
      } else {
        const store = TOPW.localStorage || W.localStorage;
        if (next === DEFAULT_CHAT_LIST_ACTIVITY_STYLE) store.removeItem(KEY_CHAT_LIST_ACTIVITY_STYLE_V1);
        else store.setItem(KEY_CHAT_LIST_ACTIVITY_STYLE_V1, next);
      }
    } catch {}
    try {
      (TOPW.document || D).documentElement.setAttribute('data-ho-chat-list-activity-style', next);
      TOPW.dispatchEvent(new CustomEvent(EV_CHAT_LIST_ACTIVITY_STYLE, { detail: { style: next, reason: 'control-hub' } }));
      if (W !== TOPW) W.dispatchEvent(new CustomEvent(EV_CHAT_LIST_ACTIVITY_STYLE, { detail: { style: next, reason: 'control-hub' } }));
    } catch {}
    return next;
  }

  function CHUB_CHAT_META_summary() {
    const api = CHUB_INTERFACE_api();
    const store = api?.store || null;
    let allMeta = null;
    try { allMeta = typeof store?.getAllMeta === 'function' ? store.getAllMeta() : null; } catch {}
    const rows = allMeta && typeof allMeta === 'object' ? Object.keys(allMeta) : [];
    let pinnedCount = 0;
    for (const id of rows) {
      try { if (store?.isPinned?.(id)) pinnedCount += 1; } catch {}
    }
    let currentChatId = '';
    try { currentChatId = api?.nav?.currentChatId?.() || ''; } catch {}
    return {
      available: !!api,
      currentChatId,
      metaRows: rows.length,
      pinnedCount,
      storeKey: api?.keys?.meta || '',
    };
  }

  function CHUB_CHAT_TITLE_api() {
    return TOPW.H2O?.ChatTitle || W.H2O?.ChatTitle || null;
  }

  function CHUB_AE_api() {
    return TOPW.H2O?.AutoEmojiTitle || W.H2O?.AutoEmojiTitle || null;
  }

  function CHUB_SKIN_api() {
    return TOPW.H2O?.Skins || TOPW.H2O?.SR?.h2oskins?.api || W.H2O?.Skins || W.H2O?.SR?.h2oskins?.api || null;
  }

  function CHUB_SKIN_listChatTitleIcons() {
    const api = CHUB_SKIN_api();
    try {
      const icons = api?.icons?.list?.('chatTitlePlaceholders') || api?.listIcons?.('chatTitlePlaceholders');
      return Array.isArray(icons) ? icons : [];
    } catch {
      return [];
    }
  }

  function CHUB_SKIN_getIconMask(icon) {
    const key = String(icon || '').trim();
    if (!key) return '';
    const api = CHUB_SKIN_api();
    try {
      return String(api?.icons?.getMask?.(key) || api?.getIconMask?.(key) || '');
    } catch {
      return '';
    }
  }

  function CHUB_AE_emptyBadgeIconOpts() {
    const labels = new Map(AE_EMPTY_BADGE_ICON_OPTIONS.map(([icon, label]) => [icon, label]));
    for (const icon of CHUB_SKIN_listChatTitleIcons()) {
      const key = String(icon?.key || icon?.[0] || '').trim();
      const label = String(icon?.label || icon?.[1] || '').trim();
      if (labels.has(key) && label) labels.set(key, label);
    }

    const api = CHUB_AE_api();
    let options = null;
    try { options = api?.getConfig?.()?.emptyBadgeIconOptions; } catch {}
    if (Array.isArray(options)) {
      for (const [icon, label] of options) {
        const key = String(icon || '').trim();
        if (labels.has(key) && label) labels.set(key, String(label));
      }
    }
    return AE_EMPTY_BADGE_ICON_OPTIONS.map(([icon, label]) => [icon, labels.get(icon) || label]);
  }

  function CHUB_AE_emptyBadgeIconLabel(value) {
    const key = CHUB_AE_normalizeEmptyBadgeIcon(value);
    const match = CHUB_AE_emptyBadgeIconOpts().find(([icon]) => icon === key);
    return match?.[1] || key;
  }

  function CHUB_AE_normalizeEmptyBadgeIcon(value) {
    const raw = String(value || '').trim();
    return AE_EMPTY_BADGE_ICON_KEYS.includes(raw) ? raw : DEFAULT_AE_EMPTY_BADGE_ICON;
  }

  function CHUB_AE_emptyBadgeIconMask(value) {
    const key = CHUB_AE_normalizeEmptyBadgeIcon(value);
    return CHUB_SKIN_getIconMask(key) || AE_EMPTY_BADGE_ICON_MASKS[key] || AE_EMPTY_BADGE_ICON_MASKS[DEFAULT_AE_EMPTY_BADGE_ICON];
  }

  function CHUB_AE_getEmptyBadgeIcon() {
    const api = CHUB_AE_api();
    try {
      const icon = api?.getConfig?.()?.emptyBadgeIcon || api?.getEmptyBadgeIcon?.();
      if (icon) return CHUB_AE_normalizeEmptyBadgeIcon(icon);
    } catch {}
    return CHUB_AE_normalizeEmptyBadgeIcon(storage.getStr(KEY_AE_EMPTY_BADGE_ICON_V1, DEFAULT_AE_EMPTY_BADGE_ICON));
  }

  function CHUB_AE_setEmptyBadgeIcon(value) {
    const next = CHUB_AE_normalizeEmptyBadgeIcon(value);
    const api = CHUB_AE_api();
    try {
      if (typeof api?.applySetting === 'function') {
        api.applySetting('emptyBadgeIcon', next);
        return;
      }
      if (typeof api?.setEmptyBadgeIcon === 'function') {
        api.setEmptyBadgeIcon(next);
        return;
      }
    } catch {}
    try {
      const store = TOPW.localStorage || W.localStorage;
      store.setItem(KEY_AE_EMPTY_BADGE_ICON_V1, next);
    } catch {}
    try {
      TOPW.dispatchEvent(new CustomEvent(EV_AE_SETTINGS_CANON, { detail: { key: 'emptyBadgeIcon', emptyBadgeIcon: next, reason: 'control-hub' } }));
      TOPW.dispatchEvent(new CustomEvent(EV_AE_SETTINGS_LEG, { detail: { key: 'emptyBadgeIcon', emptyBadgeIcon: next, reason: 'control-hub' } }));
    } catch {}
  }

  function CHUB_AE_renderEmptyBadgeIconPicker() {
    const root = D.createElement('div');
    root.className = `${CLS}-aeIconPicker`;

    const refreshPressed = (activeKey) => {
      root.querySelectorAll(`.${CLS}-aeIconOption`).forEach((button) => {
        button.setAttribute('aria-pressed', button.dataset.iconKey === activeKey ? 'true' : 'false');
      });
    };

    for (const [icon, label] of CHUB_AE_emptyBadgeIconOpts()) {
      const key = CHUB_AE_normalizeEmptyBadgeIcon(icon);
      const button = D.createElement('button');
      button.type = 'button';
      button.className = `${CLS}-aeIconOption`;
      button.dataset.iconKey = key;
      button.title = label;
      button.setAttribute('aria-pressed', key === CHUB_AE_getEmptyBadgeIcon() ? 'true' : 'false');

      const mark = D.createElement('span');
      mark.className = `${CLS}-aeIconOptionIcon`;
      mark.setAttribute('aria-hidden', 'true');
      mark.style.setProperty('--h2o-ae-icon-mask', `url("${CHUB_AE_emptyBadgeIconMask(key)}")`);

      const text = D.createElement('span');
      text.className = `${CLS}-aeIconOptionLabel`;
      text.textContent = label;

      button.append(mark, text);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        CHUB_AE_setEmptyBadgeIcon(key);
        refreshPressed(key);
        invalidate();
      }, true);

      root.appendChild(button);
    }

    return root;
  }

  function CHUB_AE_pickerGroupingOpts() {
    const api = CHUB_AE_api();
    let options = null;
    try { options = api?.getConfig?.()?.pickerGroupingOptions; } catch {}
    const src = Array.isArray(options) && options.length ? options : AE_PICKER_GROUPING_OPTIONS;
    return src.map(([key, label]) => [key, label]);
  }

  function CHUB_AE_normalizePickerGrouping(value) {
    const raw = String(value || '').trim().toLowerCase();
    return AE_PICKER_GROUPING_OPTIONS.some(([key]) => key === raw) ? raw : DEFAULT_AE_PICKER_GROUPING;
  }

  function CHUB_AE_getPickerGrouping() {
    const api = CHUB_AE_api();
    try {
      const grouping = api?.getConfig?.()?.pickerGrouping || api?.getPickerGrouping?.();
      if (grouping) return CHUB_AE_normalizePickerGrouping(grouping);
    } catch {}
    return CHUB_AE_normalizePickerGrouping(storage.getStr(KEY_AE_PICKER_GROUPING_V1, DEFAULT_AE_PICKER_GROUPING));
  }

  function CHUB_AE_setPickerGrouping(value) {
    const next = CHUB_AE_normalizePickerGrouping(value);
    const api = CHUB_AE_api();
    try {
      if (typeof api?.applySetting === 'function') {
        api.applySetting('pickerGrouping', next);
        return;
      }
      if (typeof api?.setPickerGrouping === 'function') {
        api.setPickerGrouping(next);
        return;
      }
    } catch {}
    try {
      const store = TOPW.localStorage || W.localStorage;
      store.setItem(KEY_AE_PICKER_GROUPING_V1, next);
    } catch {}
    try {
      TOPW.dispatchEvent(new CustomEvent(EV_AE_SETTINGS_CANON, { detail: { key: 'pickerGrouping', pickerGrouping: next, reason: 'control-hub' } }));
      TOPW.dispatchEvent(new CustomEvent(EV_AE_SETTINGS_LEG, { detail: { key: 'pickerGrouping', pickerGrouping: next, reason: 'control-hub' } }));
    } catch {}
  }

  function CHUB_CHAT_TITLE_selfCheck() {
    const api = CHUB_CHAT_TITLE_api();
    if (!api) return null;
    try {
      if (typeof api.selfCheck === 'function') return api.selfCheck();
      if (typeof api.getState === 'function') return api.getState();
    } catch {}
    return null;
  }

  function CHUB_CHAT_TITLE_refresh() {
    const api = CHUB_CHAT_TITLE_api();
    if (!api || typeof api.refresh !== 'function') return { message: 'Chat Title state owner unavailable.' };
    const state = safeCall('chatTitle.refresh', () => api.refresh('control-hub'));
    const title = state?.displayTitle || state?.currentTitle || state?.baseTitle || '';
    return { message: title ? `Title refreshed: ${title}` : 'Title state refreshed.' };
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

  const CHAT_LIST_CONTROLS = Object.freeze([
    {
      type: 'custom',
      key: 'interfaceState',
      label: 'Chat List',
      group: 'Visibility',
      render() {
        return renderInfoList([
          { label: 'State', value: CHUB_INTERFACE_isVisible() ? 'Visible' : 'Hidden' },
          { label: 'Right Edge Control', value: CHUB_CHAT_LIST_activityStyleLabel(CHUB_CHAT_LIST_getActivityStyle()) },
          { label: 'Hint', value: 'Use the row switch to show or hide chat-list decoration on the page.' },
        ]);
      },
    },
    {
      type: 'select',
      key: 'chatListActivityStyle',
      label: 'Right Edge Control',
      group: 'Style',
      help: 'Choose between the thin edge strip and the wider edge strip. Both open the same chat-list controls.',
      def: DEFAULT_CHAT_LIST_ACTIVITY_STYLE,
      opts: CHUB_CHAT_LIST_activityStyleOpts,
      getLive() { return CHUB_CHAT_LIST_getActivityStyle(); },
      setLive(v) { CHUB_CHAT_LIST_setActivityStyle(v); invalidate(); },
    },
  ]);

  const CHAT_META_CONTROLS = Object.freeze([
    {
      type: 'custom',
      key: 'chatMetaState',
      label: 'Chat Meta',
      group: 'Runtime',
      render() {
        const summary = CHUB_CHAT_META_summary();
        return renderInfoList([
          { label: 'State', value: summary.available ? 'Available' : 'Unavailable' },
          { label: 'Current Chat', value: summary.currentChatId || 'None' },
          { label: 'Cached Chats', value: String(summary.metaRows) },
          { label: 'Pinned Chats', value: String(summary.pinnedCount) },
          { label: 'Store', value: summary.storeKey || 'Unavailable' },
        ]);
      },
    },
  ]);

  const CHAT_TITLE_CONTROLS = Object.freeze([
    {
      type: 'custom',
      key: 'chatTitleState',
      label: 'Chat Title',
      group: 'Runtime',
      render() {
        const check = CHUB_CHAT_TITLE_selfCheck();
        return renderInfoList([
          { label: 'State', value: check ? 'Available' : 'Unavailable' },
          { label: 'Title', value: check?.displayTitle || check?.currentTitle || check?.baseTitle || 'None' },
          { label: 'Emoji', value: check?.currentEmoji || check?.emoji || 'None' },
          { label: 'Pre-emoji Icon', value: CHUB_AE_emptyBadgeIconLabel(CHUB_AE_getEmptyBadgeIcon()) },
          { label: 'Palette', value: CHUB_AE_getPickerGrouping() === 'internal' ? 'H2O Internal Groups' : 'OS Emoji Categories' },
          { label: 'Route', value: check?.routeKind || 'Unknown' },
          { label: 'Storage', value: check?.storageBackend || check?.durability?.backend || 'Unknown' },
        ]);
      },
    },
    {
      type: 'custom',
      key: 'chatTitleEmptyBadgeIcon',
      label: 'Pre-emoji Chat Icon',
      group: 'Badge',
      help: 'Icon shown in the chat emoji slot before a chat has an emoji. Clicking it still assigns a suggested emoji.',
      stackBelowLabel: true,
      render() {
        return CHUB_AE_renderEmptyBadgeIconPicker();
      },
    },
    {
      type: 'select',
      key: 'chatTitlePickerGrouping',
      label: 'Emoji Palette Grouping',
      group: 'Palette',
      help: 'Choose the default Title Palette grouping: OS-style emoji categories or the compact internal H2O title groups.',
      def: DEFAULT_AE_PICKER_GROUPING,
      opts: CHUB_AE_pickerGroupingOpts,
      getLive() { return CHUB_AE_getPickerGrouping(); },
      setLive(v) { CHUB_AE_setPickerGrouping(v); },
    },
    {
      type: 'action',
      key: 'chatTitleRefresh',
      label: 'Refresh Chat Title',
      group: 'Runtime',
      help: 'Refreshes the canonical chat-title state owner for the current route.',
      buttonLabel: 'Refresh',
      action: CHUB_CHAT_TITLE_refresh,
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
          { label: 'State', value: CHUB_TITLES_isVisible() ? 'Visible' : 'Hidden' },
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
    [FEATURE_KEY_CHAT_LIST]: CHAT_LIST_CONTROLS,
    [FEATURE_KEY_CHAT_META]: CHAT_META_CONTROLS,
    [FEATURE_KEY_CHAT_TITLE]: CHAT_TITLE_CONTROLS,
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
        cssText: interfaceCssText,
        visibility: INTERFACE_VISIBILITY,
      });
      api.registerPlugin({
        key: FEATURE_KEY_CHAT_LIST,
        getControls() {
          return CONTROLS_BY_KEY[FEATURE_KEY_CHAT_LIST];
        },
      });
      api.registerPlugin({
        key: FEATURE_KEY_CHAT_META,
        getControls() {
          return CONTROLS_BY_KEY[FEATURE_KEY_CHAT_META];
        },
      });
      api.registerPlugin({
        key: FEATURE_KEY_CHAT_TITLE,
        getControls() {
          return CONTROLS_BY_KEY[FEATURE_KEY_CHAT_TITLE];
        },
      });
      api.registerPlugin({
        key: 'titles',
        meta: TITLES_META,
        category: 'nav',
        getControls() {
          return CONTROLS_BY_KEY.titles;
        },
      });
      api.registerPlugin({
        key: 'numbers',
        meta: NUMBERS_META,
        category: 'nav',
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
