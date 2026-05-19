// ==H2O Module==
// @h2o-id             0z1p.interface.controls.control.hub.plugin
// @name               0Z1p.⚫️🖥️🕹️ Interface Controls (Control Hub 🔌 Plugin) 🕹️
// @namespace          H2O.Premium.CGX.interface.controls.control.hub.plugin
// @author             HumamDev
// @version            0.1.0
// @revision           001
// @build              260508-000000
// @description        Controls payload provider for the Interface surface split. No active registration or lifecycle ownership.
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
  const MARK = '__H2O_CHUB_INTERFACE_CONTROLS_PROVIDER_V010__';
  const ALIAS_ID = '0Z1p._Interface_Controls_(Control_Hub_Plugin)_.js';
  const OPEN_EVENT = 'evt:h2o:chub:open';

  if (W[MARK]) return;
  W[MARK] = true;

  const FEATURE_KEY_INTERFACE = 'interface';
  const FEATURE_KEY_CHAT_NAVIGATION = 'chatNavigation';
  const FEATURE_KEY_CHAT_LIST = 'interfaceEnhancer';
  const FEATURE_KEY_CHAT_META = 'chatMeta';
  const FEATURE_KEY_CHAT_TITLE = 'chatTitle';
  const KEY_DEV_SIMULATE_UNAVAILABLE_V1 = 'h2o:dev:surface:interface-controls:simulate-unavailable:v1';
  const KEY_DEV_SIMULATE_DELAYED_MS_V1 = 'h2o:dev:surface:interface-controls:simulate-delayed-ms:v1';
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
  const DEFAULT_AE_EMPTY_BADGE_ICON = 'chat-bubble-stack';
  const DEFAULT_AE_PICKER_GROUPING = 'os';

  const CHAT_LIST_ACTIVITY_STYLE_OPTIONS = Object.freeze([
    Object.freeze(['edge-strip', 'Thin Edge Strip']),
    Object.freeze(['edge-wide', 'Wide Edge Strip']),
  ]);

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

  let DEV_FORCE_AVAILABLE = false;
  let DEV_DELAY_TIMER = 0;
  let DEV_DELAY_TIMER_STARTED = false;

  function getOwner() {
    return H2O.Surface?.Interface || null;
  }

  function ownerReady() {
    return !!(getOwner() && getOwner().ownerReady === true);
  }

  function simulateUnavailable() {
    try {
      const raw = String((TOPW.localStorage || W.localStorage).getItem(KEY_DEV_SIMULATE_UNAVAILABLE_V1) || '').trim().toLowerCase();
      return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
    } catch {
      return false;
    }
  }

  function delayedMs() {
    try {
      const raw = Number((TOPW.localStorage || W.localStorage).getItem(KEY_DEV_SIMULATE_DELAYED_MS_V1) || 0);
      return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    } catch {
      return 0;
    }
  }

  function shouldSimulateUnavailable() {
    if (DEV_FORCE_AVAILABLE) return false;
    return simulateUnavailable() || delayedMs() > 0;
  }

  function requestOwnerInvalidate(reason = 'dev-controls-ready') {
    try {
      const owner = getOwner();
      if (typeof owner?.replayOpenPanel === 'function') {
        if (owner.replayOpenPanel(FEATURE_KEY_INTERFACE)) return;
      }
      if (typeof owner?.replayActiveDetail === 'function') {
        if (owner.replayActiveDetail(FEATURE_KEY_INTERFACE)) return;
      }
      if (typeof owner?.refreshControls === 'function') {
        if (owner.refreshControls(FEATURE_KEY_INTERFACE)) return;
      }
      if (typeof owner?.invalidate === 'function') owner.invalidate();
    } catch (error) {
      try { console.warn('[H2O InterfaceControls] invalidate ' + reason, error); } catch {}
    }
  }

  function markControlsAvailable(reason = 'manual') {
    if (DEV_FORCE_AVAILABLE) return false;
    DEV_FORCE_AVAILABLE = true;
    requestOwnerInvalidate(reason);
    return true;
  }

  function ensureDelayedAvailabilityTimer() {
    if (DEV_DELAY_TIMER_STARTED) return;
    const ms = delayedMs();
    if (!(ms > 0)) return;
    DEV_DELAY_TIMER_STARTED = true;
    try {
      DEV_DELAY_TIMER = W.setTimeout(() => {
        DEV_DELAY_TIMER = 0;
        markControlsAvailable('delayed-ready');
      }, ms);
    } catch {
      DEV_DELAY_TIMER = 0;
    }
  }

  function getCLS() {
    try {
      return String(getOwner()?.getSkinClass?.() || 'cgxui-cnhb');
    } catch {
      return 'cgxui-cnhb';
    }
  }

  function invalidate() {
    try {
      const owner = getOwner();
      if (typeof owner?.invalidate === 'function') owner.invalidate();
    } catch {}
  }

  function safeCall(label, fn) {
    try { return fn(); } catch (error) { try { console.warn('[H2O InterfaceControls] ' + label, error); } catch {} }
    return undefined;
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
    const cls = getCLS();
    const root = D.createElement('div');
    root.className = `${cls}-infoList`;
    if (!rows.length) return root;

    for (const item of rows) {
      const row = D.createElement('div');
      row.className = `${cls}-infoLine`;

      const key = D.createElement('span');
      key.className = `${cls}-infoKey`;
      key.textContent = item.label || 'Info';

      const value = D.createElement('span');
      value.className = `${cls}-infoVal`;
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
    const cls = getCLS();
    const root = D.createElement('div');
    root.className = `${cls}-aeIconPicker`;

    const refreshPressed = (activeKey) => {
      root.querySelectorAll(`.${cls}-aeIconOption`).forEach((button) => {
        button.setAttribute('aria-pressed', button.dataset.iconKey === activeKey ? 'true' : 'false');
      });
    };

    for (const [icon, label] of CHUB_AE_emptyBadgeIconOpts()) {
      const key = CHUB_AE_normalizeEmptyBadgeIcon(icon);
      const button = D.createElement('button');
      button.type = 'button';
      button.className = `${cls}-aeIconOption`;
      button.dataset.iconKey = key;
      button.title = label;
      button.setAttribute('aria-pressed', key === CHUB_AE_getEmptyBadgeIcon() ? 'true' : 'false');

      const mark = D.createElement('span');
      mark.className = `${cls}-aeIconOptionIcon`;
      mark.setAttribute('aria-hidden', 'true');
      mark.style.setProperty('--h2o-ae-icon-mask', `url("${CHUB_AE_emptyBadgeIconMask(key)}")`);

      const text = D.createElement('span');
      text.className = `${cls}-aeIconOptionLabel`;
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

  const CONTROLS_BUNDLE = Object.freeze({
    controlsByKey: CONTROLS_BY_KEY,
    titlesMeta: TITLES_META,
    numbersMeta: NUMBERS_META,
  });

  const __doInit = () => {
    ensureDelayedAvailabilityTimer();

    H2O.Surface = H2O.Surface || {};
    H2O.Surface.InterfaceControls = Object.freeze({
      version: 1,
      get controlsReady() {
        return ownerReady() && !shouldSimulateUnavailable();
      },
      getBundle() {
        if (shouldSimulateUnavailable()) return null;
        return CONTROLS_BUNDLE;
      },
      getDevState() {
        return Object.freeze({
          ownerReady: ownerReady(),
          simulateUnavailable: simulateUnavailable(),
          delayedMs: delayedMs(),
          forcedAvailable: DEV_FORCE_AVAILABLE,
          controlsReady: ownerReady() && !shouldSimulateUnavailable(),
          storageKeys: Object.freeze({
            unavailable: KEY_DEV_SIMULATE_UNAVAILABLE_V1,
            delayedMs: KEY_DEV_SIMULATE_DELAYED_MS_V1,
          }),
          timerActive: DEV_DELAY_TIMER > 0,
        });
      },
      selfCheck() {
        return Object.freeze({
          ownerReady: ownerReady(),
          simulateUnavailable: simulateUnavailable(),
          delayedMs: delayedMs(),
          forcedAvailable: DEV_FORCE_AVAILABLE,
          controlsReady: ownerReady() && !shouldSimulateUnavailable(),
          controlKeys: Object.keys(CONTROLS_BY_KEY),
        });
      },
      dev: Object.freeze({
        simulateAvailable() {
          markControlsAvailable('manual-ready');
          return H2O.Surface?.InterfaceControls?.getDevState?.() || null;
        },
      }),
    });

    if (!shouldSimulateUnavailable()) {
      requestOwnerInvalidate('l5-controls-ready');
    }
  };

  try {
    const loaderApi = (W && W.H2O && W.H2O.loader) || null;
    if (loaderApi && typeof loaderApi.registerOnDemand === 'function') {
      loaderApi.registerOnDemand(ALIAS_ID, OPEN_EVENT);
    }
    if (loaderApi && typeof loaderApi.guard === 'function') {
      loaderApi.guard(ALIAS_ID, __doInit);
    } else {
      __doInit();
    }
  } catch (_) {
    try { __doInit(); } catch (_) {}
  }
})();
