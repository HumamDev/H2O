// ==UserScript==
// @h2o-id             0z1k.appearance.tab.control.hub.plugin
// @name               0Z1k.⚫️🎨🕹️ Appearance Tab (Control Hub 🔌 Plugin) 🕹️
// @namespace          H2O.Premium.CGX.appearance.tab.control.hub.plugin
// @author             HumamDev
// @version            0.1.0
// @revision           001
// @build              260505-000000
// @description        Registers the Appearance tab, Themes subtab, and Accents subtab into Control Hub via plugin API.
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
  const MARK = '__H2O_CHUB_APPEARANCE_TAB_PLUGIN_V010__';

  if (W[MARK]) return;
  W[MARK] = true;

  let LAST_API = null;
  let CLS = 'cgxui-cnhb';

  const FEATURE_KEY_APPEARANCE = 'themes';
  const FEATURE_KEY_THEMES_PANEL = 'themesPanel';
  const FEATURE_KEY_ACCENTS = 'accents';

  const KEY_CHUB_TAB_VIS_V1 = 'h2o:prm:cgx:cntrlhb:state:tab-visibility:v1';
  const KEY_CHUB_APPEARANCE_SUBTAB_V1 = 'h2o:prm:cgx:cntrlhb:state:themes:subtab:v1';
  const KEY_CHUB_ACCENT_V1 = 'h2o:prm:cgx:cntrlhb:state:accent:v1';
  const KEY_CHUB_BUTTON_ACCENT_V1 = 'h2o:prm:cgx:cntrlhb:state:accent:buttons:v1';
  const KEY_CHUB_NAV_ACCENT_V1 = 'h2o:prm:cgx:cntrlhb:state:accent:navigation:v1';
  const KEY_CHUB_SURFACE_ACCENT_V1 = 'h2o:prm:cgx:cntrlhb:state:accent:surface:v1';
  const KEY_CHUB_CONTROL_ACCENT_V1 = 'h2o:prm:cgx:cntrlhb:state:accent:control:v1';
  const KEY_CHUB_PANEL_BG_V1 = 'h2o:prm:cgx:cntrlhb:state:bg:panel:v1';
  const KEY_CHUB_PANE_BG_V1 = 'h2o:prm:cgx:cntrlhb:state:bg:pane-tabs:v1';

  const CHUB_THEME_SETTINGS_KEY_V2 = 'h2o:prm:cgx:thmspnl:ui:settings:v2';
  const CHUB_THEME_SETTINGS_KEY_LEGACY = 'ho:gpthemeSettings';
  const CHUB_THEME_SETTINGS_EVENT = 'evt:h2o:themes:settings_changed';

  const CHUB_THEME_DEFAULTS = Object.freeze({
    enabled: true,
    mode: 'dark',
    accentLight: '270, 80%, 75%',
    accentDark: '265, 70%, 62%',
    accentUserBubble: false,
    fontFamily: 'system',
    fontSize: 16,
    lineHeight: 28,
    letterSpace: 0,
    chatWidth: 48,
    promptWidth: 48,
    chatFullWidth: false,
    syncPromptWidth: true,
    hideHeader: false,
    hideFooter: false,
    expandChatbox: false,
    bubblesUser: true,
    bubblesGpt: true,
    scrollAlign: 'right',
  });

  const APPEARANCE_META = Object.freeze({
    key: FEATURE_KEY_APPEARANCE,
    label: 'Appearance',
    icon: '🎨',
    subtitle: 'Visual theme, Control Hub accents, and surface tuning.',
    category: 'perf',
    description: Object.freeze({
      default: 'Tune visual themes, Control Hub accent colors, and panel surfaces from one Appearance tab.',
      focus: 'Keep reading contrast and Control Hub surfaces aligned for focused sessions.',
      review: 'Adjust long-session colors and Control Hub accents without leaving appearance controls.',
      performance: 'Keep visual tuning grouped while the theme engine and Control Hub shell stay unchanged.',
    }),
  });

  const APPEARANCE_SUBTABS = Object.freeze([
    Object.freeze({
      key: FEATURE_KEY_THEMES_PANEL,
      label: 'Themes',
      icon: '🎨',
      subtitle: 'Color themes and layout tweaks.',
      description: Object.freeze({
        default: 'Open the themes surface and keep theme defaults together in one tab.',
        focus: 'Use theme controls to keep reading contrast consistent.',
        review: 'Adjust long-session colors without mixing them into unrelated interface tools.',
        performance: 'Simplify theme changes when you want the lightest UI setup.',
      }),
    }),
    Object.freeze({
      key: FEATURE_KEY_ACCENTS,
      label: 'Accents',
      icon: '🕹️',
      subtitle: 'Control Hub accent and background tuning.',
      description: Object.freeze({
        default: 'Tune Control Hub accent colors and shell backgrounds.',
        focus: 'Keep buttons, selected tabs, and panel surfaces visually aligned.',
        review: 'Adjust Control Hub colors without changing saved theme settings.',
        performance: 'Use saved Control Hub accent settings without changing the theme engine.',
      }),
    }),
  ]);

  const storage = {
    getStr(key, fallback = null) {
      try {
        const store = TOPW.localStorage || W.localStorage;
        const value = store.getItem(key);
        return value == null ? fallback : value;
      } catch {
        return fallback;
      }
    },
    setStr(key, value) {
      try {
        const store = TOPW.localStorage || W.localStorage;
        store.setItem(key, String(value));
        return true;
      } catch {
        return false;
      }
    },
    getJSON(key, fallback = null) {
      const raw = this.getStr(key, null);
      if (raw == null) return fallback;
      try { return JSON.parse(raw); } catch { return fallback; }
    },
  };

  function safeCall(_label, fn) {
    try { return fn(); } catch {}
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

  function CHUB_THEME_loadSettings() {
    const diskObj = storage.getJSON(CHUB_THEME_SETTINGS_KEY_V2, null);
    if (diskObj && typeof diskObj === 'object') return { ...CHUB_THEME_DEFAULTS, ...diskObj };
    const legacyObj = storage.getJSON(CHUB_THEME_SETTINGS_KEY_LEGACY, null);
    if (legacyObj && typeof legacyObj === 'object') return { ...CHUB_THEME_DEFAULTS, ...legacyObj };
    return { ...CHUB_THEME_DEFAULTS };
  }

  function CHUB_THEME_applySettings(settings) {
    const S = { ...CHUB_THEME_DEFAULTS, ...(settings || {}) };
    const rootStyle = D.documentElement?.style;
    if (!D.body || !rootStyle) return S;

    if (!S.enabled) {
      D.body.removeAttribute('data-ho-theme-enabled');
      D.documentElement.removeAttribute('data-ho-mode');
      rootStyle.removeProperty('--ho-accent-light-hsl');
      rootStyle.removeProperty('--ho-accent-dark-hsl');
      rootStyle.removeProperty('--ho-font-size');
      rootStyle.removeProperty('--ho-line-height');
      rootStyle.removeProperty('--ho-letter-space');
      rootStyle.removeProperty('--ho-chat-width-rem');
      rootStyle.removeProperty('--ho-prompt-width-rem');
      D.body.removeAttribute('data-ho-font');
      return S;
    }

    D.body.setAttribute('data-ho-theme-enabled', 'true');
    D.documentElement.setAttribute('data-ho-mode', String(S.mode || 'dark'));
    rootStyle.setProperty('--ho-accent-light-hsl', String(S.accentLight || CHUB_THEME_DEFAULTS.accentLight));
    rootStyle.setProperty('--ho-accent-dark-hsl', String(S.accentDark || CHUB_THEME_DEFAULTS.accentDark));

    let fontFlag = String(S.fontFamily || 'system');
    if (!['system', 'inter', 'mono'].includes(fontFlag)) fontFlag = 'system';
    D.body.setAttribute('data-ho-font', fontFlag);

    rootStyle.setProperty('--ho-font-size', `${Number(S.fontSize || CHUB_THEME_DEFAULTS.fontSize)}px`);
    rootStyle.setProperty('--ho-line-height', `${Number(S.lineHeight || CHUB_THEME_DEFAULTS.lineHeight)}px`);
    rootStyle.setProperty('--ho-letter-space', `${Number(S.letterSpace || CHUB_THEME_DEFAULTS.letterSpace)}px`);
    rootStyle.setProperty('--ho-chat-width-rem', `${Number(S.chatWidth || CHUB_THEME_DEFAULTS.chatWidth)}rem`);
    rootStyle.setProperty('--ho-prompt-width-rem', `${Number(S.promptWidth || CHUB_THEME_DEFAULTS.promptWidth)}rem`);

    D.body.setAttribute('data-ho-chat-full', String(!!S.chatFullWidth));
    D.body.setAttribute('data-ho-sync-prompt', String(!!S.syncPromptWidth));
    D.body.setAttribute('data-ho-hide-header', String(!!S.hideHeader));
    D.body.setAttribute('data-ho-hide-footer', String(!!S.hideFooter));
    D.body.setAttribute('data-ho-expand-chatbox', String(!!S.expandChatbox));
    D.body.setAttribute('data-ho-bubble-user', String(S.bubblesUser !== false));
    D.body.setAttribute('data-ho-bubble-gpt', String(S.bubblesGpt !== false));
    D.body.setAttribute('data-ho-accent-user-bubble', String(!!S.accentUserBubble));
    return S;
  }

  function CHUB_ACCENT_normalize(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'dark' || value === 'charcoal') return 'dark';
    if (value === 'orange') return 'orange';
    if (value === 'logo-blue' || value === 'logoblue' || value === 'logo_blue') return 'logo-blue';
    if (value === 'soft-gold' || value === 'softgold' || value === 'gold-soft' || value === 'yellow-gold') return 'soft-gold';
    if (value === 'soft-amber' || value === 'softamber' || value === 'amber-soft') return 'soft-amber';
    if (value === 'deep-blue' || value === 'deepblue' || value === 'calm-blue') return 'deep-blue';
    if (value === 'neutral-glow' || value === 'neutralglow' || value === 'neutral') return 'neutral-glow';
    if (value === 'quiet-gradient' || value === 'quietgradient' || value === 'low-gradient' || value === 'soft-gradient') return 'quiet-gradient';
    return 'default';
  }

  function CHUB_PANEL_BG_normalize(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'dark' || value === 'charcoal') return 'dark';
    if (value === 'logo-blue' || value === 'logoblue' || value === 'logo_blue') return 'logo-blue';
    if (value === 'cockpit-ember' || value === 'cockpitember' || value === 'cockpit_ember' || value === 'onboarding') return 'cockpit-ember';
    return 'default';
  }

  function CHUB_PANE_BG_normalize(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'logo-blue' || value === 'logoblue' || value === 'logo_blue') return 'logo-blue';
    if (value === 'sand-glass' || value === 'sandglass' || value === 'sand_glass') return 'sand-glass';
    if (value === 'cockpit-ember' || value === 'cockpitember' || value === 'cockpit_ember' || value === 'onboarding') return 'cockpit-ember';
    return 'default';
  }

  function CHUB_CONTROL_ACCENT_opts() {
    return [
      ['default', 'Gold'],
      ['dark', 'Dark'],
      ['logo-blue', 'Ocean Blue'],
      ['orange', 'Orange'],
      ['soft-gold', 'Soft Gold'],
      ['soft-amber', 'Soft Amber'],
      ['deep-blue', 'Deep Blue'],
      ['neutral-glow', 'Neutral Glow'],
      ['quiet-gradient', 'Quiet Gradient'],
    ];
  }

  function CHUB_PANEL_BG_opts() {
    return [
      ['default', 'Sand Glass'],
      ['dark', 'Dark'],
      ['logo-blue', 'Ocean Blue'],
      ['cockpit-ember', 'Cockpit Ember'],
    ];
  }

  function CHUB_PANE_BG_opts() {
    return [
      ['sand-glass', 'Sand Glass'],
      ['default', 'Dark'],
      ['logo-blue', 'Ocean Blue'],
      ['cockpit-ember', 'Cockpit Ember'],
    ];
  }

  function CHUB_ACCENT_getLegacy() {
    return CHUB_ACCENT_normalize(storage.getStr(KEY_CHUB_ACCENT_V1, 'default'));
  }

  function CHUB_CONTROL_ACCENT_get() {
    const raw = storage.getStr(KEY_CHUB_CONTROL_ACCENT_V1, null);
    if (raw != null) return CHUB_ACCENT_normalize(raw);
    const legacyNav = storage.getStr(KEY_CHUB_NAV_ACCENT_V1, null);
    if (legacyNav != null) return CHUB_ACCENT_normalize(legacyNav);
    const legacyButtons = storage.getStr(KEY_CHUB_BUTTON_ACCENT_V1, null);
    if (legacyButtons != null) return CHUB_ACCENT_normalize(legacyButtons);
    return CHUB_ACCENT_getLegacy();
  }

  function CHUB_PANEL_BG_get() {
    const raw = storage.getStr(KEY_CHUB_PANEL_BG_V1, null);
    if (raw != null) return CHUB_PANEL_BG_normalize(raw);
    if (CHUB_PANEL_BG_normalize(storage.getStr(KEY_CHUB_SURFACE_ACCENT_V1, null)) === 'logo-blue') return 'logo-blue';
    return CHUB_ACCENT_getLegacy() === 'logo-blue' ? 'logo-blue' : 'default';
  }

  function CHUB_PANE_BG_get() {
    const raw = storage.getStr(KEY_CHUB_PANE_BG_V1, null);
    if (raw != null) return CHUB_PANE_BG_normalize(raw);
    if (CHUB_PANE_BG_normalize(storage.getStr(KEY_CHUB_SURFACE_ACCENT_V1, null)) === 'logo-blue') return 'logo-blue';
    return CHUB_ACCENT_getLegacy() === 'logo-blue' ? 'logo-blue' : 'default';
  }

  function CHUB_ACCENT_setRootAttr(name, value) {
    if (!D.documentElement) return value;
    if (value === 'default') D.documentElement.removeAttribute(name);
    else D.documentElement.setAttribute(name, value);
    return value;
  }

  function CHUB_ACCENT_apply() {
    const controlAccent = CHUB_CONTROL_ACCENT_get();
    const panelBg = CHUB_PANEL_BG_get();
    const paneBg = CHUB_PANE_BG_get();
    if (D.documentElement) {
      D.documentElement.removeAttribute('data-h2o-chub-accent');
      D.documentElement.removeAttribute('data-h2o-chub-button-accent');
      D.documentElement.removeAttribute('data-h2o-chub-nav-accent');
      D.documentElement.removeAttribute('data-h2o-chub-surface-accent');
    }
    CHUB_ACCENT_setRootAttr('data-h2o-chub-control-accent', controlAccent);
    CHUB_ACCENT_setRootAttr('data-h2o-chub-panel-bg', panelBg);
    CHUB_ACCENT_setRootAttr('data-h2o-chub-pane-bg', paneBg);
    return { controlAccent, panelBg, paneBg };
  }

  function CHUB_CONTROL_ACCENT_set(value) {
    const next = CHUB_ACCENT_normalize(value);
    storage.setStr(KEY_CHUB_CONTROL_ACCENT_V1, next);
    CHUB_ACCENT_apply();
    invalidate();
    return next;
  }

  function CHUB_PANEL_BG_set(value) {
    const next = CHUB_PANEL_BG_normalize(value);
    storage.setStr(KEY_CHUB_PANEL_BG_V1, next);
    CHUB_ACCENT_apply();
    invalidate();
    return next;
  }

  function CHUB_PANE_BG_set(value) {
    const next = CHUB_PANE_BG_normalize(value);
    storage.setStr(KEY_CHUB_PANE_BG_V1, next);
    CHUB_ACCENT_apply();
    invalidate();
    return next;
  }

  function CHUB_VIS_isAppearanceVisible() {
    const state = storage.getJSON(KEY_CHUB_TAB_VIS_V1, {}) || {};
    return state[FEATURE_KEY_APPEARANCE] !== false;
  }

  function CHUB_THEME_applyVisibilityState() {
    const saved = CHUB_THEME_loadSettings();
    CHUB_THEME_applySettings(CHUB_VIS_isAppearanceVisible() ? saved : { ...saved, enabled: false });
  }

  function scheduleThemeVisibilityApply() {
    const delays = [0, 250, 1000, 2400];
    for (const delay of delays) {
      try { W.setTimeout(() => CHUB_THEME_applyVisibilityState(), delay); } catch {}
    }
  }

  function scheduleAccentApply() {
    const delays = [0, 250, 1000];
    for (const delay of delays) {
      try { W.setTimeout(() => CHUB_ACCENT_apply(), delay); } catch {}
    }
  }

  const APPEARANCE_VISIBILITY = Object.freeze({
    selectors: Object.freeze([
      '[data-cgxui-owner="thpn"]',
    ]),
    applyHidden(hidden) {
      const saved = CHUB_THEME_loadSettings();
      CHUB_THEME_applySettings(hidden ? { ...saved, enabled: false } : saved);
    },
  });

  const THEMES_CONTROLS = Object.freeze([
    Object.freeze({
      type: 'select',
      key: 'thPreset',
      label: 'Preset',
      group: 'Themes Panel',
      def: 'system',
      opts: Object.freeze([
        Object.freeze(['system', 'System']),
        Object.freeze(['darkMatte', 'Dark Matte']),
        Object.freeze(['neon', 'Neon']),
      ]),
    }),
  ]);

  const ACCENT_CONTROLS = Object.freeze([
    Object.freeze({
      type: 'select',
      key: 'chubControlAccent',
      label: 'Control Accent',
      group: 'Control Hub Colors',
      help: 'Keeps buttons, switches, selected tabs, feature list selection, category rail, and subtabs aligned.',
      def: 'default',
      opts: CHUB_CONTROL_ACCENT_opts,
      getLive() { return CHUB_CONTROL_ACCENT_get(); },
      setLive(v) { return CHUB_CONTROL_ACCENT_set(v); },
    }),
    Object.freeze({
      type: 'select',
      key: 'chubPanelBackground',
      label: 'Panel Background',
      group: 'Control Hub Backgrounds',
      help: 'Changes the outer Control Hub shell. Sand Glass is the original panel look.',
      def: 'default',
      opts: CHUB_PANEL_BG_opts,
      getLive() { return CHUB_PANEL_BG_get(); },
      setLive(v) { return CHUB_PANEL_BG_set(v); },
    }),
    Object.freeze({
      type: 'select',
      key: 'chubPaneBackground',
      label: 'Interior Surfaces',
      group: 'Control Hub Backgrounds',
      help: 'Changes the right pane, mode pills, category rail tabs, and feature card surfaces together.',
      def: 'default',
      opts: CHUB_PANE_BG_opts,
      getLive() { return CHUB_PANE_BG_get(); },
      setLive(v) { return CHUB_PANE_BG_set(v); },
    }),
  ]);

  function themesPanelApi() {
    return W.H2O?.TP?.thmspnl?.api || W.H2O?.TP?.themes?.api || null;
  }

  function mountThemesPanelAction({ panel, skin } = {}) {
    if (!panel) return;
    const skinCls = skin?.CLS || CLS;
    const bodySel = skin?.bodySel || `.${skinCls}-body`;
    const body = panel.querySelector(bodySel);

    const action = D.createElement('div');
    action.className = `${skinCls}-theme-action`;
    action.setAttribute('data-h2o-chub-artifact', '1');

    const btn = D.createElement('button');
    btn.type = 'button';
    btn.className = `${skinCls}-themeBtn`;
    btn.textContent = 'Open Themes Panel';

    let retry = 0;
    const checkReady = () => {
      const api = themesPanelApi();
      const ready = !!api?.open;
      btn.disabled = !ready;
      btn.title = ready ? 'Launch the themes customization panel' : 'Themes panel is loading...';
      if (!ready && retry < 6) {
        retry += 1;
        W.setTimeout(checkReady, 600);
      }
    };
    checkReady();

    btn.addEventListener('click', () => {
      safeCall('open-theme-panel', () => {
        themesPanelApi()?.open?.();
        const api = LAST_API || getApi();
        if (api?.hide) api.hide();
      });
    }, true);

    action.appendChild(btn);
    if (body) body.insertAdjacentElement('afterend', action);
    else panel.appendChild(action);
  }

  function register() {
    const api = getApi();
    if (!api?.registerPlugin) return false;
    if (api === LAST_API) return true;

    try {
      applySkin(api);
      CHUB_ACCENT_apply();
      CHUB_THEME_applyVisibilityState();
      api.registerPlugin({
        key: FEATURE_KEY_APPEARANCE,
        title: 'Appearance Tab',
        meta: APPEARANCE_META,
        category: 'perf',
        subtabs: APPEARANCE_SUBTABS,
        subtabStorageKey: KEY_CHUB_APPEARANCE_SUBTAB_V1,
        visibility: APPEARANCE_VISIBILITY,
      });
      api.registerPlugin({
        key: FEATURE_KEY_THEMES_PANEL,
        getControls() {
          return THEMES_CONTROLS;
        },
        detailHook: mountThemesPanelAction,
      });
      api.registerPlugin({
        key: FEATURE_KEY_ACCENTS,
        getControls() {
          return ACCENT_CONTROLS;
        },
      });
      LAST_API = api;
      invalidate(api);
      return true;
    } catch (error) {
      try { console.warn('[H2O AppearanceTab] register failed', error); } catch {}
      return false;
    }
  }

  safeCall('earlyAccentApply', () => CHUB_ACCENT_apply());
  scheduleAccentApply();
  safeCall('earlyThemeVisibilityApply', () => CHUB_THEME_applyVisibilityState());
  scheduleThemeVisibilityApply();

  W.addEventListener(CHUB_THEME_SETTINGS_EVENT, () => {
    CHUB_THEME_applyVisibilityState();
  }, true);

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
