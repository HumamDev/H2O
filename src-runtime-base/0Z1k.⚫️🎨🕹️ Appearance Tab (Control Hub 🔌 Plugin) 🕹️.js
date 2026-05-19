// ==H2O Module==
// @h2o-id             0z1k.appearance.tab.control.hub.plugin
// @name               0Z1k.⚫️🎨🕹️ Appearance Tab (Control Hub 🔌 Plugin) 🕹️
// @namespace          H2O.Premium.CGX.appearance.tab.control.hub.plugin
// @author             HumamDev
// @version            0.2.1
// @revision           004
// @build              260510-011500
// @description        Registers the Appearance tab with two strictly separated subtabs: ChatGPT Appearance (the original/base ChatGPT website theme via H2O.theme / Theme Core plus GPThemes page styling + native ChatGPT accent sync) and Cockpit Appearance (Cockpit Pro / H2O surface tuning via the existing Control Hub accent + background system). ChatGPT controls mirror the Themes Panel. Cockpit controls retain their existing storage keys. ARCHITECTURE RULE: ChatGPT/base page surfaces are owned by Theme Core / GPThemes; Cockpit/H2O modules (Library, Control Hub, MiniMap, Side Actions Panel, Command Bar, Dock, H2O cards/panels) are owned by Cockpit Appearance. The two systems must NOT cross-control each other.
// @match       https://chatgpt.com/*
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
  const MARK = '__H2O_CHUB_APPEARANCE_TAB_PLUGIN_V011__';

  if (W[MARK]) return;
  W[MARK] = true;

  let LAST_API = null;
  let CLS = 'cgxui-cnhb';
  let THEME_EVENT_INVALIDATE_TIMER = 0;

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
    mode: 'system',
    themePreset: 'lavender',
    nativeAccent: 'default',
    accentLight: '260, 55%, 78%',
    accentDark: '260, 45%, 62%',
    fontFamily: 'system',
    fontScope: 'chat',
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

  const CHUB_THEME_PRESETS = Object.freeze([
    Object.freeze({ key: 'lavender', name: 'Lavender', light: '260, 55%, 78%', dark: '260, 45%, 62%' }),
    Object.freeze({ key: 'coral',    name: 'Coral',    light: '12, 70%, 72%',  dark: '12, 60%, 55%' }),
    Object.freeze({ key: 'aqua',     name: 'Aqua',     light: '188, 55%, 70%', dark: '188, 50%, 50%' }),
    Object.freeze({ key: 'emerald',  name: 'Emerald',  light: '152, 45%, 68%', dark: '152, 40%, 48%' }),
    Object.freeze({ key: 'amber',    name: 'Amber',    light: '40, 70%, 72%',  dark: '36, 65%, 52%' }),
    Object.freeze({ key: 'rose',     name: 'Rose',     light: '338, 60%, 72%', dark: '338, 52%, 54%' }),
    Object.freeze({ key: 'slate',    name: 'Slate',    light: '220, 18%, 70%', dark: '220, 18%, 46%' }),
  ]);

  const CHUB_THEME_PRESET_MAP = Object.freeze(
    CHUB_THEME_PRESETS.reduce((acc, preset) => {
      acc[preset.key] = preset;
      return acc;
    }, Object.create(null))
  );

  const CHUB_NATIVE_ACCENT_PRESETS = Object.freeze([
    Object.freeze({ key: 'default', name: 'Default' }),
    Object.freeze({ key: 'green',   name: 'Green' }),
    Object.freeze({ key: 'blue',    name: 'Blue' }),
    Object.freeze({ key: 'yellow',  name: 'Yellow' }),
    Object.freeze({ key: 'orange',  name: 'Orange' }),
    Object.freeze({ key: 'pink',    name: 'Pink' }),
    Object.freeze({ key: 'purple',  name: 'Purple' }),
  ]);

  const CHUB_FONT_PRESETS = Object.freeze([
    Object.freeze({ key: 'system',        name: 'Default' }),
    Object.freeze({ key: 'inter',         name: 'Inter-like' }),
    Object.freeze({ key: 'readable',      name: 'Readable Sans' }),
    Object.freeze({ key: 'optima',        name: 'Optima' }),
    Object.freeze({ key: 'avenir',        name: 'Avenir' }),
    Object.freeze({ key: 'humanist',      name: 'Humanist Sans' }),
    Object.freeze({ key: 'serif',         name: 'Serif Reading' }),
    Object.freeze({ key: 'premium-serif', name: 'Premium Serif' }),
    Object.freeze({ key: 'mono',          name: 'Mono' }),
  ]);

  const CHUB_FONT_PRESET_MAP = Object.freeze(
    CHUB_FONT_PRESETS.reduce((acc, preset) => {
      acc[preset.key] = preset;
      return acc;
    }, Object.create(null))
  );

  const CHUB_FONT_SCOPE_PRESETS = Object.freeze([
    Object.freeze({ key: 'chat', name: 'Chat Only' }),
    Object.freeze({ key: 'page', name: 'Entire ChatGPT Page' }),
  ]);

  const CHUB_FONT_STACKS = Object.freeze({
    system: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
    inter: '"Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
    readable: '"Atkinson Hyperlegible", Verdana, Arial, system-ui, sans-serif',
    optima: 'Optima, Candara, "Segoe UI", Frutiger, "Frutiger Linotype", "Trebuchet MS", sans-serif',
    avenir: 'Avenir, "Avenir Next", "Nunito Sans", "Segoe UI", system-ui, sans-serif',
    humanist: '"Gill Sans", "Gill Sans MT", Calibri, "Trebuchet MS", system-ui, sans-serif',
    serif: 'Georgia, "Times New Roman", ui-serif, serif',
    'premium-serif': '"Iowan Old Style", "Palatino Linotype", Palatino, Charter, Georgia, serif',
    mono: '"SF Mono", "Cascadia Code", Menlo, Consolas, ui-monospace, monospace',
  });

  const APPEARANCE_META = Object.freeze({
    key: FEATURE_KEY_APPEARANCE,
    label: 'Appearance',
    icon: '🎨',
    subtitle: 'ChatGPT/base website theme + Cockpit / H2O surface tuning.',
    category: 'perf',
    description: Object.freeze({
      default: 'Tune the ChatGPT/base website theme and the Cockpit / H2O surfaces from one Appearance tab.',
      focus: 'Keep ChatGPT reading contrast and Cockpit surfaces aligned for focused sessions.',
      review: 'Adjust the ChatGPT page mode and Cockpit accents without leaving appearance controls.',
      performance: 'Keep visual tuning grouped while the theme engine and Control Hub shell stay unchanged.',
    }),
  });

  // Two appearance categories — strictly separated by ownership:
  //   • ChatGPT Appearance  → ORIGINAL/BASE ChatGPT website/page theme.
  //                           Owned by H2O.theme (8A1a Theme Core) + GPThemes
  //                           Customization (8A1b Themes Panel). Affects the
  //                           ChatGPT page background, ChatGPT-native sidebar,
  //                           main column, message bubbles, header, composer.
  //                           MUST NOT control Cockpit/H2O modules.
  //   • Cockpit Appearance  → Cockpit Pro / H2O-added modules and surfaces.
  //                           Affects Control Hub, Library workspace, MiniMap,
  //                           Side Actions Panel, Command Bar, Dock, H2O cards.
  //                           MUST NOT be controlled by GPThemes Customization.
  // Internal subtab keys are kept for storage-key compatibility (saved subtab
  // selection persists). Visible labels reflect the user-facing meaning.
  const APPEARANCE_SUBTABS = Object.freeze([
    Object.freeze({
      key: FEATURE_KEY_THEMES_PANEL,
      label: 'ChatGPT Appearance',
      icon: '🎨',
      subtitle: 'Original/base ChatGPT website theme via Theme Core + GPThemes.',
      description: Object.freeze({
        default: 'Set the original/base ChatGPT page theme. Owned by H2O.theme (Theme Core) and GPThemes Customization.',
        focus: 'Pick the base mode that keeps reading contrast comfortable for long sessions.',
        review: 'Switch ChatGPT mode, GPThemes page theme, and native ChatGPT accent; deeper controls still open in the GPThemes panel.',
        performance: 'Base ChatGPT theme application is owned by Theme Core; this surface only switches state. Cockpit modules have their own controls.',
      }),
    }),
    Object.freeze({
      key: FEATURE_KEY_ACCENTS,
      label: 'Cockpit Appearance',
      icon: '🕹️',
      subtitle: 'Cockpit Pro / H2O modules — Control Hub, Library, MiniMap, Dock, etc.',
      description: Object.freeze({
        default: 'Tune Cockpit Pro / H2O module colors and surfaces. Independent of the ChatGPT/base theme.',
        focus: 'Keep Cockpit buttons, selected tabs, and module surfaces visually aligned.',
        review: 'Adjust Cockpit accents and surfaces without changing the ChatGPT/base theme.',
        performance: 'Cockpit appearance is stored separately from the ChatGPT/base theme.',
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
    setJSON(key, value) {
      try { return this.setStr(key, JSON.stringify(value)); } catch { return false; }
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

  function scheduleInvalidate(api = LAST_API) {
    if (THEME_EVENT_INVALIDATE_TIMER) {
      try { W.clearTimeout(THEME_EVENT_INVALIDATE_TIMER); } catch {}
    }
    THEME_EVENT_INVALIDATE_TIMER = W.setTimeout(() => {
      THEME_EVENT_INVALIDATE_TIMER = 0;
      invalidate(api);
    }, 180);
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

  function CHUB_THEME_clampNumber(raw, fallback, min, max, precision = 0) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    const clamped = Math.min(max, Math.max(min, n));
    return precision > 0 ? Number(clamped.toFixed(precision)) : Math.round(clamped);
  }

  function CHUB_THEME_normalizeMode(raw) {
    const value = String(raw || '').trim().toLowerCase();
    return (value === 'light' || value === 'dark' || value === 'system') ? value : CHUB_THEME_DEFAULTS.mode;
  }

  function CHUB_THEME_normalizeThemePreset(raw) {
    const value = String(raw || '').trim().toLowerCase();
    return CHUB_THEME_PRESET_MAP[value] ? value : CHUB_THEME_DEFAULTS.themePreset;
  }

  function CHUB_THEME_applyThemePreset(target, raw) {
    const key = CHUB_THEME_normalizeThemePreset(raw);
    const preset = CHUB_THEME_PRESET_MAP[key] || CHUB_THEME_PRESET_MAP[CHUB_THEME_DEFAULTS.themePreset];
    target.themePreset = preset.key;
    target.accentLight = preset.light;
    target.accentDark = preset.dark;
    return preset;
  }

  function CHUB_THEME_normalizeNativeAccent(raw) {
    const value = String(raw || '').trim().toLowerCase();
    return CHUB_NATIVE_ACCENT_PRESETS.some(preset => preset.key === value) ? value : CHUB_THEME_DEFAULTS.nativeAccent;
  }

  function CHUB_THEME_normalizeFontFamily(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'default') return 'system';
    if (value === 'readable-sans') return 'readable';
    if (value === 'serif-reading') return 'serif';
    if (value === 'premiumserif' || value === 'premium-serif-reading') return 'premium-serif';
    if (value === 'humanist-sans') return 'humanist';
    return CHUB_FONT_PRESET_MAP[value] ? value : CHUB_THEME_DEFAULTS.fontFamily;
  }

  function CHUB_THEME_normalizeFontScope(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'all' || value === 'full' || value === 'entire') return 'page';
    return (value === 'chat' || value === 'page') ? value : CHUB_THEME_DEFAULTS.fontScope;
  }

  function CHUB_THEME_normalizeScrollAlign(raw) {
    const value = String(raw || '').trim().toLowerCase();
    return (value === 'left' || value === 'center' || value === 'right') ? value : CHUB_THEME_DEFAULTS.scrollAlign;
  }

  function CHUB_THEME_normalizeSettings(raw) {
    const S = { ...CHUB_THEME_DEFAULTS, ...(raw || {}) };
    S.enabled = S.enabled !== false;
    S.mode = CHUB_THEME_normalizeMode(S.mode);
    CHUB_THEME_applyThemePreset(S, S.themePreset);
    S.nativeAccent = CHUB_THEME_normalizeNativeAccent(S.nativeAccent);
    S.fontFamily = CHUB_THEME_normalizeFontFamily(S.fontFamily);
    S.fontScope = CHUB_THEME_normalizeFontScope(S.fontScope);
    S.fontSize = CHUB_THEME_clampNumber(S.fontSize, CHUB_THEME_DEFAULTS.fontSize, 12, 22, 0);
    S.lineHeight = CHUB_THEME_clampNumber(S.lineHeight, CHUB_THEME_DEFAULTS.lineHeight, 18, 34, 0);
    S.letterSpace = CHUB_THEME_clampNumber(S.letterSpace, CHUB_THEME_DEFAULTS.letterSpace, -1, 2, 1);
    S.chatWidth = CHUB_THEME_clampNumber(S.chatWidth, CHUB_THEME_DEFAULTS.chatWidth, 40, 70, 0);
    S.promptWidth = CHUB_THEME_clampNumber(S.promptWidth, CHUB_THEME_DEFAULTS.promptWidth, 40, 70, 0);
    S.chatFullWidth = !!S.chatFullWidth;
    S.syncPromptWidth = S.syncPromptWidth !== false;
    S.hideHeader = !!S.hideHeader;
    S.hideFooter = !!S.hideFooter;
    S.expandChatbox = !!S.expandChatbox;
    S.bubblesUser = S.bubblesUser !== false;
    S.bubblesGpt = S.bubblesGpt !== false;
    S.scrollAlign = CHUB_THEME_normalizeScrollAlign(S.scrollAlign);
    return S;
  }

  function CHUB_THEME_loadSettings() {
    const diskObj = storage.getJSON(CHUB_THEME_SETTINGS_KEY_V2, null);
    if (diskObj && typeof diskObj === 'object') return CHUB_THEME_normalizeSettings(diskObj);
    const legacyObj = storage.getJSON(CHUB_THEME_SETTINGS_KEY_LEGACY, null);
    if (legacyObj && typeof legacyObj === 'object') return CHUB_THEME_normalizeSettings(legacyObj);
    return CHUB_THEME_normalizeSettings(CHUB_THEME_DEFAULTS);
  }

  function CHUB_THEME_saveSettings(settings) {
    const S = CHUB_THEME_normalizeSettings(settings);
    storage.setJSON(CHUB_THEME_SETTINGS_KEY_V2, S);
    storage.setJSON(CHUB_THEME_SETTINGS_KEY_LEGACY, S);
    try { W.dispatchEvent(new CustomEvent(CHUB_THEME_SETTINGS_EVENT, { detail: { ...S } })); } catch {}
    return S;
  }

  function CHUB_THEME_applySettingsPatch(base, patch = {}) {
    const S = CHUB_THEME_normalizeSettings(base);
    if (!patch || typeof patch !== 'object') return S;

    if (Object.prototype.hasOwnProperty.call(patch, 'enabled')) S.enabled = !!patch.enabled;
    if (Object.prototype.hasOwnProperty.call(patch, 'mode')) S.mode = CHUB_THEME_normalizeMode(patch.mode);
    if (Object.prototype.hasOwnProperty.call(patch, 'themePreset')) CHUB_THEME_applyThemePreset(S, patch.themePreset);
    if (Object.prototype.hasOwnProperty.call(patch, 'nativeAccent')) S.nativeAccent = CHUB_THEME_normalizeNativeAccent(patch.nativeAccent);
    if (Object.prototype.hasOwnProperty.call(patch, 'fontFamily')) S.fontFamily = CHUB_THEME_normalizeFontFamily(patch.fontFamily);
    if (Object.prototype.hasOwnProperty.call(patch, 'fontScope')) S.fontScope = CHUB_THEME_normalizeFontScope(patch.fontScope);
    if (Object.prototype.hasOwnProperty.call(patch, 'fontSize')) S.fontSize = CHUB_THEME_clampNumber(patch.fontSize, S.fontSize, 12, 22, 0);
    if (Object.prototype.hasOwnProperty.call(patch, 'lineHeight')) S.lineHeight = CHUB_THEME_clampNumber(patch.lineHeight, S.lineHeight, 18, 34, 0);
    if (Object.prototype.hasOwnProperty.call(patch, 'letterSpace')) S.letterSpace = CHUB_THEME_clampNumber(patch.letterSpace, S.letterSpace, -1, 2, 1);

    const hasSyncPrompt = Object.prototype.hasOwnProperty.call(patch, 'syncPromptWidth');
    const hasChatWidth = Object.prototype.hasOwnProperty.call(patch, 'chatWidth');
    const hasPromptWidth = Object.prototype.hasOwnProperty.call(patch, 'promptWidth');

    if (hasSyncPrompt) S.syncPromptWidth = !!patch.syncPromptWidth;
    if (hasChatWidth) {
      S.chatWidth = CHUB_THEME_clampNumber(patch.chatWidth, S.chatWidth, 40, 70, 0);
      if (S.syncPromptWidth) S.promptWidth = S.chatWidth;
    }
    if (hasPromptWidth) {
      S.promptWidth = CHUB_THEME_clampNumber(patch.promptWidth, S.promptWidth, 40, 70, 0);
      if (!hasSyncPrompt || !S.syncPromptWidth) S.syncPromptWidth = false;
    }
    if (hasSyncPrompt && S.syncPromptWidth) S.promptWidth = S.chatWidth;

    if (Object.prototype.hasOwnProperty.call(patch, 'chatFullWidth')) S.chatFullWidth = !!patch.chatFullWidth;
    if (Object.prototype.hasOwnProperty.call(patch, 'hideHeader')) S.hideHeader = !!patch.hideHeader;
    if (Object.prototype.hasOwnProperty.call(patch, 'hideFooter')) S.hideFooter = !!patch.hideFooter;
    if (Object.prototype.hasOwnProperty.call(patch, 'expandChatbox')) S.expandChatbox = !!patch.expandChatbox;
    if (Object.prototype.hasOwnProperty.call(patch, 'scrollAlign')) S.scrollAlign = CHUB_THEME_normalizeScrollAlign(patch.scrollAlign);
    return S;
  }

  function CHUB_THEME_applySettings(settings) {
    const S = CHUB_THEME_normalizeSettings(settings);
    const rootStyle = D.documentElement?.style;
    if (!D.body || !rootStyle) return S;

    if (!S.enabled) {
      D.body.removeAttribute('data-ho-theme-enabled');
      D.documentElement.removeAttribute('data-ho-mode');
      rootStyle.removeProperty('--ho-accent-light-hsl');
      rootStyle.removeProperty('--ho-accent-dark-hsl');
      rootStyle.removeProperty('--ho-font-family');
      rootStyle.removeProperty('--ho-font-size');
      rootStyle.removeProperty('--ho-line-height');
      rootStyle.removeProperty('--ho-letter-space');
      rootStyle.removeProperty('--ho-chat-width-rem');
      rootStyle.removeProperty('--ho-prompt-width-rem');
      D.body.removeAttribute('data-ho-font');
      D.body.removeAttribute('data-ho-font-scope');
      D.body.removeAttribute('data-ho-font-tuned');
      D.body.removeAttribute('data-ho-layout-tuned');
      D.body.removeAttribute('data-ho-scroll-align');
      return S;
    }

    D.body.setAttribute('data-ho-theme-enabled', 'true');
    D.documentElement.setAttribute('data-ho-mode', String(S.mode || 'system'));
    rootStyle.setProperty('--ho-accent-light-hsl', String(S.accentLight || CHUB_THEME_DEFAULTS.accentLight));
    rootStyle.setProperty('--ho-accent-dark-hsl', String(S.accentDark || CHUB_THEME_DEFAULTS.accentDark));

    const fontFlag = CHUB_THEME_normalizeFontFamily(S.fontFamily);
    const fontScope = CHUB_THEME_normalizeFontScope(S.fontScope);
    D.body.setAttribute('data-ho-font', fontFlag);
    D.body.setAttribute('data-ho-font-scope', fontScope);
    D.body.setAttribute('data-ho-font-tuned', String(
      fontFlag !== CHUB_THEME_DEFAULTS.fontFamily ||
      Number(S.fontSize) !== CHUB_THEME_DEFAULTS.fontSize ||
      Number(S.lineHeight) !== CHUB_THEME_DEFAULTS.lineHeight ||
      Number(S.letterSpace) !== CHUB_THEME_DEFAULTS.letterSpace
    ));
    D.body.setAttribute('data-ho-layout-tuned', String(
      Number(S.chatWidth) !== CHUB_THEME_DEFAULTS.chatWidth ||
      Number(S.promptWidth) !== CHUB_THEME_DEFAULTS.promptWidth ||
      Boolean(S.chatFullWidth) !== CHUB_THEME_DEFAULTS.chatFullWidth ||
      Boolean(S.syncPromptWidth) !== CHUB_THEME_DEFAULTS.syncPromptWidth
    ));

    rootStyle.setProperty('--ho-font-family', CHUB_FONT_STACKS[fontFlag] || CHUB_FONT_STACKS.system);
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
    D.body.setAttribute('data-ho-scroll-align', CHUB_THEME_normalizeScrollAlign(S.scrollAlign));
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

  /* ────────────── ChatGPT Appearance — original/base ChatGPT website theme ──────────────
   * Owner: H2O.theme (8A1a Theme Core) + GPThemes Customization (8A1b Themes
   * Panel). This surface only switches state; it does NOT define tokens or
   * palettes itself.
   *
   * Targets ChatGPT-native page only (page background, ChatGPT sidebar/main/
   * messages/header/composer where safe). MUST NOT control Cockpit/H2O modules
   * (Library, Control Hub, MiniMap, Side Actions Panel, Command Bar, Dock).
   * Cockpit modules are controlled by Cockpit Appearance below.
   *
   *   Mode         — native ChatGPT appearance mode (system / light / dark).
   *   Theme        — GPThemes page styling preset (independent of native
   *                  ChatGPT Settings accent color).
   *   Accent       — native ChatGPT accent color; mirrored with ChatGPT
   *                  Settings and the GPThemes panel.
   * ────────────────────────────────────────────────────────────────────────── */

  function THEME_CORE() {
    return W.H2O?.theme || null;
  }

  function BASE_THEME_get() {
    const t = THEME_CORE();
    const mode = t?.get?.()?.mode;
    return (mode === 'system' || mode === 'light' || mode === 'dark') ? mode : 'system';
  }

  function BASE_THEME_set(value) {
    const next = (value === 'light' || value === 'dark' || value === 'system') ? value : 'system';
    const t = THEME_CORE();
    if (t && typeof t.setMode === 'function') {
      try { t.setMode(next); } catch {}
    }
    return next;
  }

  function TPANEL_api() {
    return themesPanelApi();
  }

  function TPANEL_settings() {
    return TPANEL_api()?.getSettings?.() || CHUB_THEME_loadSettings();
  }

  function TPANEL_update(patch = {}) {
    const api = TPANEL_api();
    if (api?.updateSettings) {
      const next = api.updateSettings(patch);
      return next || TPANEL_settings();
    }

    const next = CHUB_THEME_applySettingsPatch(CHUB_THEME_loadSettings(), patch);
    CHUB_THEME_saveSettings(next);
    CHUB_THEME_applyVisibilityState();
    if (Object.prototype.hasOwnProperty.call(patch, 'mode')) BASE_THEME_set(next.mode);
    return next;
  }

  function TPANEL_value_get(key, fallback) {
    const settings = TPANEL_settings();
    return settings && Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : fallback;
  }

  function TPANEL_value_set(key, value) {
    const next = TPANEL_update({ [key]: value });
    return next?.[key];
  }

  function TPANEL_mode_get() {
    return TPANEL_settings()?.mode || BASE_THEME_get();
  }

  function TPANEL_mode_set(value) {
    const next = (value === 'light' || value === 'dark' || value === 'system') ? value : 'system';
    const api = TPANEL_api();
    if (api?.setMode) return api.setMode(next);
    TPANEL_update({ mode: next });
    return BASE_THEME_set(next);
  }

  function TPANEL_theme_get() {
    return String(TPANEL_settings()?.themePreset || 'lavender');
  }

  function TPANEL_theme_set(value) {
    const api = TPANEL_api();
    if (api?.setThemePreset) return api.setThemePreset(value);
    return TPANEL_update({ themePreset: value })?.themePreset || 'lavender';
  }

  function TPANEL_theme_opts() {
    const api = TPANEL_api();
    const list = api?.listThemePresets?.() || [];
    if (Array.isArray(list) && list.length) return list.map(p => [p.key, p.name]);
    return CHUB_THEME_PRESETS.map(p => [p.key, p.name]);
  }

  function TPANEL_nativeAccent_get() {
    return String(TPANEL_settings()?.nativeAccent || 'default');
  }

  function TPANEL_nativeAccent_set(value) {
    const api = TPANEL_api();
    if (api?.setNativeAccent) return api.setNativeAccent(value);
    return TPANEL_update({ nativeAccent: value })?.nativeAccent || 'default';
  }

  function TPANEL_nativeAccent_opts() {
    const api = TPANEL_api();
    const list = api?.listNativeAccents?.() || [];
    if (Array.isArray(list) && list.length) return list.map(p => [p.key, p.name]);
    return CHUB_NATIVE_ACCENT_PRESETS.map(p => [p.key, p.name]);
  }

  function TPANEL_fontFamily_opts() {
    const api = TPANEL_api();
    const list = api?.listFontPresets?.() || [];
    if (Array.isArray(list) && list.length) return list.map(p => [p.key, p.name]);
    return CHUB_FONT_PRESETS.map(p => [p.key, p.name]);
  }

  function TPANEL_fontScope_opts() {
    const api = TPANEL_api();
    const list = api?.listFontScopes?.() || [];
    if (Array.isArray(list) && list.length) return list.map(p => [p.key, p.name]);
    return CHUB_FONT_SCOPE_PRESETS.map(p => [p.key, p.name]);
  }

  function TPANEL_scrollAlign_opts() {
    return [
      ['left', 'Left'],
      ['center', 'Center'],
      ['right', 'Right'],
    ];
  }

  function TPANEL_renderLetterSpaceControl() {
    const box = D.createElement('div');
    box.className = `${CLS}-rangebox`;

    const inp = D.createElement('input');
    inp.type = 'range';
    inp.min = '-1';
    inp.max = '2';
    inp.step = '0.1';
    inp.value = String(TPANEL_value_get('letterSpace', CHUB_THEME_DEFAULTS.letterSpace));

    const val = D.createElement('span');
    val.className = `${CLS}-rangeval`;
    const sync = () => {
      const n = CHUB_THEME_clampNumber(inp.value, CHUB_THEME_DEFAULTS.letterSpace, -1, 2, 1);
      val.textContent = `${n}px`;
      return n;
    };

    sync();
    inp.addEventListener('input', () => {
      TPANEL_value_set('letterSpace', sync());
    }, true);

    box.append(inp, val);
    return box;
  }

  const BASE_APPEARANCE_CONTROLS = Object.freeze([
    Object.freeze({
      type: 'toggle',
      key: 'chatgptThemeEnabled',
      label: 'GPThemes Enabled',
      group: 'Theme',
      help: 'Same control as the GPThemes panel Theme ON/OFF switch.',
      def: true,
      getLive() { return TPANEL_value_get('enabled', true) !== false; },
      setLive(v) { return TPANEL_value_set('enabled', v); },
    }),
    Object.freeze({
      type: 'select',
      key: 'chatgptMode',
      label: 'Mode',
      group: 'Theme',
      help: 'ChatGPT appearance mode. Same control as the Themes panel and ChatGPT Settings.',
      def: 'system',
      opts: () => [
        ['system', 'System'],
        ['light', 'Light'],
        ['dark',  'Dark'],
      ],
      getLive() { return TPANEL_mode_get(); },
      setLive(v) { return TPANEL_mode_set(v); },
    }),
    Object.freeze({
      type: 'select',
      key: 'chatgptTheme',
      label: 'Theme',
      group: 'Theme',
      help: 'GPThemes page styling preset. Same control as the Themes panel theme cards. This is independent from ChatGPT Settings accent color.',
      def: 'lavender',
      opts: TPANEL_theme_opts,
      getLive() { return TPANEL_theme_get(); },
      setLive(v) { return TPANEL_theme_set(v); },
    }),
    Object.freeze({
      type: 'select',
      key: 'chatgptAccent',
      label: 'Accent',
      group: 'Theme',
      help: 'Native ChatGPT accent color. Same control as ChatGPT Settings and the Themes panel accent cards.',
      def: 'default',
      opts: TPANEL_nativeAccent_opts,
      getLive() { return TPANEL_nativeAccent_get(); },
      setLive(v) { return TPANEL_nativeAccent_set(v); },
    }),
    Object.freeze({
      type: 'select',
      key: 'chatgptFontFamily',
      label: 'Font Family',
      group: 'Font',
      help: 'Same control as GPThemes Font Family. Applies only to ChatGPT/base targets.',
      def: 'system',
      opts: TPANEL_fontFamily_opts,
      getLive() { return CHUB_THEME_normalizeFontFamily(TPANEL_value_get('fontFamily', 'system')); },
      setLive(v) { return TPANEL_value_set('fontFamily', v); },
    }),
    Object.freeze({
      type: 'select',
      key: 'chatgptFontScope',
      label: 'Font Scope',
      group: 'Font',
      help: 'Chat Only affects messages and composer. Entire ChatGPT Page extends to safe ChatGPT shell targets.',
      def: 'chat',
      opts: TPANEL_fontScope_opts,
      getLive() { return CHUB_THEME_normalizeFontScope(TPANEL_value_get('fontScope', 'chat')); },
      setLive(v) { return TPANEL_value_set('fontScope', v); },
    }),
    Object.freeze({
      type: 'range',
      key: 'chatgptFontSize',
      label: 'Font Size',
      group: 'Font',
      help: 'Same GPThemes font-size control for scoped ChatGPT text.',
      def: 16,
      min: 12,
      max: 22,
      step: 1,
      unit: 'px',
      getLive() { return Number(TPANEL_value_get('fontSize', 16)); },
      setLive(v) { return TPANEL_value_set('fontSize', v); },
    }),
    Object.freeze({
      type: 'range',
      key: 'chatgptLineHeight',
      label: 'Line Height',
      group: 'Font',
      help: 'Same GPThemes line-height control for scoped ChatGPT text.',
      def: 28,
      min: 18,
      max: 34,
      step: 1,
      unit: 'px',
      getLive() { return Number(TPANEL_value_get('lineHeight', 28)); },
      setLive(v) { return TPANEL_value_set('lineHeight', v); },
    }),
    Object.freeze({
      type: 'custom',
      key: 'chatgptLetterSpace',
      label: 'Letter Space',
      group: 'Font',
      help: 'Same GPThemes letter-spacing control, preserving 0.1px steps.',
      stackBelowLabel: false,
      render() { return TPANEL_renderLetterSpaceControl(); },
    }),
    Object.freeze({
      type: 'range',
      key: 'chatgptChatWidth',
      label: 'Chats Width',
      group: 'Layout',
      help: 'Same GPThemes Chats width control for the ChatGPT conversation column.',
      def: 48,
      min: 40,
      max: 70,
      step: 1,
      unit: 'rem',
      getLive() { return Number(TPANEL_value_get('chatWidth', 48)); },
      setLive(v) { return TPANEL_value_set('chatWidth', v); },
    }),
    Object.freeze({
      type: 'range',
      key: 'chatgptPromptWidth',
      label: 'Prompt Width',
      group: 'Layout',
      help: 'Same GPThemes Prompt width control for the ChatGPT composer.',
      def: 48,
      min: 40,
      max: 70,
      step: 1,
      unit: 'rem',
      getLive() { return Number(TPANEL_value_get('promptWidth', 48)); },
      setLive(v) { return TPANEL_value_set('promptWidth', v); },
    }),
    Object.freeze({
      type: 'toggle',
      key: 'chatgptHideHeader',
      label: 'Hide Header',
      group: 'Layout',
      help: 'Same GPThemes Hide Header control. Targets only the marked ChatGPT-native header.',
      def: false,
      getLive() { return !!TPANEL_value_get('hideHeader', false); },
      setLive(v) { return TPANEL_value_set('hideHeader', v); },
    }),
    Object.freeze({
      type: 'toggle',
      key: 'chatgptHideFooter',
      label: 'Hide Footer',
      group: 'Layout',
      help: 'Same GPThemes Hide Footer control. Safe no-op when no ChatGPT footer target exists.',
      def: false,
      getLive() { return !!TPANEL_value_get('hideFooter', false); },
      setLive(v) { return TPANEL_value_set('hideFooter', v); },
    }),
    Object.freeze({
      type: 'toggle',
      key: 'chatgptExpandChatbox',
      label: 'Expand Chatbox',
      group: 'Layout',
      help: 'Same GPThemes Expand Chatbox control for the marked ChatGPT composer input.',
      def: false,
      getLive() { return !!TPANEL_value_get('expandChatbox', false); },
      setLive(v) { return TPANEL_value_set('expandChatbox', v); },
    }),
    Object.freeze({
      type: 'toggle',
      key: 'chatgptChatFullWidth',
      label: 'Chat Full Width',
      group: 'Layout',
      help: 'Same GPThemes Chat Full Width control for the marked ChatGPT chat surface.',
      def: false,
      getLive() { return !!TPANEL_value_get('chatFullWidth', false); },
      setLive(v) { return TPANEL_value_set('chatFullWidth', v); },
    }),
    Object.freeze({
      type: 'toggle',
      key: 'chatgptSyncPromptWidth',
      label: 'Sync Prompt Width',
      group: 'Layout',
      help: 'Same GPThemes Sync Prompt Width control. When on, prompt width follows chat width.',
      def: true,
      getLive() { return TPANEL_value_get('syncPromptWidth', true) !== false; },
      setLive(v) { return TPANEL_value_set('syncPromptWidth', v); },
    }),
    Object.freeze({
      type: 'select',
      key: 'chatgptScrollAlign',
      label: 'Scrolldown Button Align',
      group: 'Layout',
      help: 'Same GPThemes alignment setting. It remains a safe no-op unless a ChatGPT-native scroll button is marked.',
      def: 'right',
      opts: TPANEL_scrollAlign_opts,
      getLive() { return CHUB_THEME_normalizeScrollAlign(TPANEL_value_get('scrollAlign', 'right')); },
      setLive(v) { return TPANEL_value_set('scrollAlign', v); },
    }),
  ]);

  /* ────────────── Cockpit Appearance — Cockpit Pro / H2O modules ──────────────
   * Owner: existing Control Hub accent + background system. STRICTLY
   * independent of the ChatGPT/base theme — these controls do NOT touch
   * H2O.theme and are NOT touched by GPThemes Customization.
   *
   * Targets: Control Hub shell, Library workspace, MiniMap, Side Actions
   * Panel, Command Bar, Dock, and other H2O cards/panels. Each module reads
   * the data-h2o-chub-* attributes written by the setters below.
   *
   *   Cockpit Theme    — RENAMED from "Panel Background"; same key/storage.
   *                      Drives the Control Hub outer shell skin.
   *   Cockpit Interior — RENAMED from "Interior Surfaces"; same key/storage.
   *                      Independent of Cockpit Theme so the inner pane tone
   *                      can differ from the outer shell.
   *   Cockpit Accent   — RENAMED from "Control Accent"; same key/storage.
   *                      Drives the Cockpit accent system (NOT Theme Core
   *                      accent — Theme Core accent ships in a later phase).
   * ────────────────────────────────────────────────────────────────────────── */
  const COCKPIT_APPEARANCE_CONTROLS = Object.freeze([
    Object.freeze({
      type: 'select',
      key: 'chubPanelBackground',
      label: 'Cockpit Theme',
      group: 'Cockpit Appearance',
      help: 'Cockpit Pro / H2O outer shell skin. Sand Glass is the original Cockpit look. Does not affect the ChatGPT/base page.',
      def: 'default',
      opts: CHUB_PANEL_BG_opts,
      getLive() { return CHUB_PANEL_BG_get(); },
      setLive(v) { return CHUB_PANEL_BG_set(v); },
    }),
    Object.freeze({
      type: 'select',
      key: 'chubPaneBackground',
      label: 'Cockpit Interior',
      group: 'Cockpit Appearance',
      help: 'Inner Cockpit panes, mode pills, category rail tabs, and feature card surfaces. Independent of Cockpit Theme so the inner tone can differ from the outer shell.',
      def: 'default',
      opts: CHUB_PANE_BG_opts,
      getLive() { return CHUB_PANE_BG_get(); },
      setLive(v) { return CHUB_PANE_BG_set(v); },
    }),
    Object.freeze({
      type: 'select',
      key: 'chubControlAccent',
      label: 'Cockpit Accent',
      group: 'Cockpit Appearance',
      help: 'Cockpit Pro / H2O accent: buttons, switches, selected tabs, category rail, and subtabs. Independent of the ChatGPT/base theme accent.',
      def: 'default',
      opts: CHUB_CONTROL_ACCENT_opts,
      getLive() { return CHUB_CONTROL_ACCENT_get(); },
      setLive(v) { return CHUB_CONTROL_ACCENT_set(v); },
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
          return BASE_APPEARANCE_CONTROLS;
        },
        detailHook: mountThemesPanelAction,
      });
      api.registerPlugin({
        key: FEATURE_KEY_ACCENTS,
        getControls() {
          return COCKPIT_APPEARANCE_CONTROLS;
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
    scheduleInvalidate();
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
