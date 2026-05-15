// ==H2O Module==
// @h2o-id             8a1b.themes.panel
// @name               8A1b.🟪🎨 Themes Panel 🎨
// @namespace          H2O.Premium.CGX.themes.panel
// @author             HumamDev
// @version            2.1.16
// @revision           004
// @build              260510-163551
// @description        Theme button next to Save/Panel/Control that opens a full GPThemes-style customization panel (Color / Font / Layout) for ChatGPT. Contract v2 Stage-1 aligned + legacy settings migration + Tiny Rail button.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

(() => {
  'use strict';

  /* ───────────────────────────── ⬜️ DEFINE — META / BOOTSTRAP 📄🔒💧 ───────────────────────────── */
  const W = window;
  const D = document;

  // ✅ Identity (LOCKED first)
  const SUITE = 'prm';
  const HOST  = 'cgx';

  const TOK   = 'TP';        // Themes Panel
  const PID   = 'thmspnl';   // canonical
  const CID   = 'tpanel';    // identifiers only: (Themes Panel) => T + PANEL
  const SkID  = 'thpn';      // Themes(TH) + Panel(PN) => thpn
  const BrID  = PID;         // default
  const DsID  = PID;         // default
  const API_VERSION = '2.1.16';
  const API_BUILD = '260510-163900';
  const API_PHASE = 'top-more-before-section-boundary';

  // labels only
  const MODTAG    = 'ThemesP';
  const MODICON   = '🎨';
  const EMOJI_HDR = 'OFF';

  // derived (identifiers only)
  const PID_UP = PID.toUpperCase();
  const CID_UP = CID.toUpperCase();

  /* [DEFINE][DOM] Real attribute-name constants (NO raw attr strings elsewhere) */
  const ATTR_CGXUI       = 'data-cgxui';
  const ATTR_CGXUI_OWNER = 'data-cgxui-owner';
  const ATTR_CGXUI_STATE = 'data-cgxui-state';

  const ATTR_ROLE        = 'role';
  const ATTR_TABINDEX    = 'tabindex';
  const ATTR_TITLE       = 'title';
  const ATTR_OWNER       = 'data-owner';

  // host-theme attrs (kept as-is behaviorally, but now no raw strings)
  const ATTR_HO_THEME_ENABLED     = 'data-ho-theme-enabled';
  const ATTR_HO_MODE             = 'data-ho-mode';
  const ATTR_HO_FONT             = 'data-ho-font';
  const ATTR_HO_FONT_SCOPE       = 'data-ho-font-scope';
  const ATTR_HO_CHAT_FULL        = 'data-ho-chat-full';
  const ATTR_HO_SYNC_PROMPT      = 'data-ho-sync-prompt';
  const ATTR_HO_HIDE_HEADER      = 'data-ho-hide-header';
  const ATTR_HO_HIDE_FOOTER      = 'data-ho-hide-footer';
  const ATTR_HO_EXPAND_CHATBOX   = 'data-ho-expand-chatbox';
  const ATTR_HO_FONT_TUNED       = 'data-ho-font-tuned';
  const ATTR_HO_LAYOUT_TUNED     = 'data-ho-layout-tuned';
  const ATTR_HO_SCROLL_ALIGN     = 'data-ho-scroll-align';
  const ATTR_HO_CHAT_ROOT        = 'data-ho-chat-root';
  const ATTR_HO_CHAT_COLUMN      = 'data-ho-chat-column';
  const ATTR_HO_MESSAGE_TEXT     = 'data-ho-message-text';
  const ATTR_HO_COMPOSER         = 'data-ho-composer';
  const ATTR_HO_COMPOSER_INPUT   = 'data-ho-composer-input';
  const ATTR_HO_CHATGPT_HEADER   = 'data-ho-chatgpt-header';
  const ATTR_HO_CHATGPT_SIDEBAR  = 'data-ho-chatgpt-sidebar';
  const ATTR_HO_CHATGPT_FOOTER   = 'data-ho-chatgpt-footer';
  const ATTR_HO_SCROLL_BUTTON    = 'data-ho-scroll-button';
  const ATTR_HO_SIDEBAR_TOP_MORE = 'data-ho-sidebar-top-more';
  const ATTR_HO_SIDEBAR_MORE_HIDDEN = 'data-ho-sidebar-more-hidden';

  /* [DEFINE][STORE][API] Namespaces (boundary-only use of DsID) */
  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`; // no trailing ":"

  /* ───────────────────────────── ⬛️ DEFINE — CONFIG / CONSTANTS 📄🔓💧 ───────────────────────────── */

  /* [STORE][ThemesP] Keys (versioned) */
  const KEY_TPANEL_UI_SETTINGS_V2 = `${NS_DISK}:ui:settings:v2`;
  const KEY_TPANEL_LEGACY_SETTINGS = 'ho:gpthemeSettings'; // legacy mirror/bridge (allowed in KEY_)

  /* [API][ThemesP] Events — canonical */
  const EV_TPANEL_SETTINGS_CHANGED = 'evt:h2o:themes:settings_changed';
  const EV_TPANEL_PANEL_OPEN       = 'evt:h2o:themes:panel_open';
  const EV_TPANEL_PANEL_CLOSE      = 'evt:h2o:themes:panel_close';

  /* [API][ThemesP] Legacy events listened (bridge only) */
  const EV_LEGACY_NAVIGATE = 'ho:navigate';

  /* [TIME] Native events */
  const EV_WIN_RESIZE  = 'resize';
  const EV_WIN_POP     = 'popstate';
  const EV_DOM_READY   = 'DOMContentLoaded';

  /* [UI][ThemesP] UI tokens — values MUST be SkID-based */
  const UI_TPANEL_STYLE     = `${SkID}-style`;
  const UI_TPANEL_BACKDROP  = `${SkID}-backdrop`;
  const UI_TPANEL_PANEL     = `${SkID}-panel`;
  const UI_TPANEL_TINY_RAIL = `${SkID}-tinyrailbtn`;

  // panel internal parts (still SkID-based)
  const UI_TPANEL_TABBTN    = `${SkID}-tabbtn`;
  const UI_TPANEL_PANE      = `${SkID}-pane`;
  const UI_TPANEL_RESET     = `${SkID}-reset`;
  const UI_TPANEL_ENABLE    = `${SkID}-enable`;
  const UI_TPANEL_CLOSE     = `${SkID}-close`;

  /* [CSS][ThemesP] Style id — MUST be cgxui-<skid>-style */
  const CSS_TPANEL_STYLE_ID = `cgxui-${SkID}-style`;

  /* [SEL][ThemesP] Selector registry (NO ad-hoc selector strings elsewhere) */
  const SEL_SEND_BTN =
    'button[data-testid="send-button"], button[aria-label="Send message"]';
  const SEL_COMPOSER_SEND_BTN =
    'button[data-testid="send-button"], button[aria-label="Send message"], button[aria-label*="send" i]';
  const SEL_CHAT_MESSAGE =
    '[data-message-author-role="assistant"], [data-message-author-role="user"]';
  const SEL_CHAT_MESSAGE_TEXT =
    '.markdown, .prose, [data-testid="markdown"], [data-testid*="message-content"], [data-testid*="message-text"], .whitespace-pre-wrap';
  const SEL_COMPOSER_FORM =
    'form[data-type="unified-composer"], form.group\\/composer, form[data-testid="composer"], form[action*="conversation"]';
  const SEL_COMPOSER_INPUT =
    '#prompt-textarea, textarea, [contenteditable="true"], [role="textbox"]';
  const SEL_CHATGPT_HEADER =
    'header, [data-testid="conversation-header"], [data-testid="chat-header"], [data-testid="thread-header"]';
  const SEL_CHATGPT_SIDEBAR =
    'nav[aria-label="Sidebar"], nav[aria-label="Chat history"]';
  const SEL_CHATGPT_FOOTER =
    '[data-testid="conversation-input-footer"], [data-testid="composer-footer"], footer';
  const SEL_CHATGPT_SCROLL_BUTTON =
    'button[aria-label*="scroll" i], button[aria-label*="bottom" i], button[data-testid*="scroll" i]';
  const SEL_CHATGPT_NATIVE_CONTEXT =
    '[data-message-author-role], [data-testid^="conversation-turn"]';
  const H2O_CHATGPT_HELPER_OWNERS = Object.freeze([
    'qbig',
    'ansn',
    'abig',
    'atns',
    'ats',
    'qts',
    'mrnc',
    'qswr',
  ]);
  const H2O_CHATGPT_HELPER_CLASS_RE =
    /\bcgxui-(?:ansn|qbig|abig|atns|ats|qts|mrnc|qswr)-/;
  const H2O_OWNED_ROOT_SELECTORS = Object.freeze([
    `[${ATTR_CGXUI_OWNER}="${SkID}"]`,
    '[data-cgxui-owner="cnhb"]',
    '[data-cgxui-owner="mnmp"]',
    '[data-cgxui-owner="dcpn"]',
    '[data-cgxui-owner="flsc"]',
    '[data-cgxui-owner="lbsc"]',
    '[data-cgxui-owner="xpch"]',
    '[data-cgxui-owner="prmn"]',
    '[data-h2o-chub]',
    '[data-h2o-chub-artifact]',
    '[data-h2o-library]',
    '[data-h2o-library-workspace="root"]',
    '[data-h2o-minimap]',
    '[data-h2o-minimap-root]',
    '[data-h2o-command]',
    '[data-h2o-side-actions]',
    '[data-h2o-cold]',
    '[data-h2o-cold-layer]',
    '[data-cgxui-page-kind]',
    '[data-h2o-sidebar-shell]',
    '[data-h2o-sidebar-shell-list]',
    '.h2o-side-actions-root',
    '.h2o-archive-dock',
    '.h2o-cold-layer',
    '.ho-mm-root',
    '.cgxui-mm-col',
    '.cgxui-mm-btn',
  ]);
  const SEL_H2O_OWNED_ROOT = H2O_OWNED_ROOT_SELECTORS.join(',');

  const SEL_TINY_RAIL = '#stage-sidebar-tiny-bar';
  const SEL_TINY_RAIL_IMG = 'img';
  const SEL_TINY_RAIL_ICON_HOST = '.icon, .icon-lg';
  const SEL_TINY_RAIL_STACK_PRIMARY = 'div.mt-\\(\\--sidebar-section-first-margin-top\\)';
  const SEL_TINY_RAIL_STACK_FALLBACK = ':scope > div:nth-child(2)';
  const SEL_TINY_RAIL_TEMPLATE_A =
    'a.__menu-item.hoverable[data-sidebar-item="true"],' +
    'a.__menu-item[data-sidebar-item="true"],' +
    'a[data-sidebar-item="true"],' +
    'a.__menu-item';
  const ATTR_TINY_RAIL_VIEW = 'data-h2o-rail-view';
  const TINY_RAIL_VIEW_THEMES = 'themes';
  const CLS_DOCK_RAIL_NAV_BTN = 'cgxui-dcpn-rail-nav-btn';
  const CLS_DOCK_RAIL_NAV_TXT = 'cgxui-dcpn-rail-nav-txt';

  // ───────────────────────── UI Locate Helpers ─────────────────────────
  // ChatGPT's DOM shifts a lot. The Themes Panel needs a *stable* anchor
  // for the small rail button. If the official tiny rail isn't present,
  // we create our own fixed-position rail to keep the button visible.
  function UI_getToolbarEl() {
    const rail = document.querySelector(SEL_TINY_RAIL);
    if (rail) return rail;

    // Fallback: create a minimal rail container once.
    let host = document.getElementById('cgxui-themes-tinyrail-fallback');
    if (!host) {
      host = document.createElement('div');
      host.id = 'cgxui-themes-tinyrail-fallback';
      host.style.position = 'fixed';
      host.style.left = '8px';
      host.style.bottom = `${CFG_TINY_RAIL_BOTTOM_ZONE_PX}px`;
      host.style.zIndex = String(CFG_Z_TINY_RAIL || 2147483644);
      host.style.display = 'flex';
      host.style.flexDirection = 'column';
      host.style.gap = '6px';
      host.style.pointerEvents = 'auto';
      (document.body || document.head)?.appendChild(host);
    }
    return host;
  }

  const CFG_PANEL_GAP_PX        = 8;
  const CFG_PANEL_WIDTH_PX      = 360;
  const CFG_PANEL_VP_MARGIN_PX  = 20;

  // Tiny rail config
  const CFG_TINY_RAIL_ID            = 'stage-sidebar-tiny-bar';
  const CFG_TINY_RAIL_TTL           = 'Palette / Themes';
  const CFG_TINY_RAIL_MIN_W         = 30;
  const CFG_TINY_RAIL_MIN_H         = 200;
  const CFG_TINY_RAIL_BOTTOM_ZONE_PX = 160;

  const CFG_TINY_BTN_W              = 24;
  const CFG_TINY_BTN_H              = 24;
  const CFG_TINY_BTN_PAD            = 8;
  /* ───────────────────────────── 🟦 SHAPE — CONTRACTS / TYPES 📄🔓💧 ───────────────────────────── */
  // (Stage-1: keep behavior same; no doc-polish here)

  /* ───────────────────────────── 🟩 TOOLS — UTILITIES 📄🔓💧 ───────────────────────────── */

  /* [SAFE][ThemesP] storage wrapper */
  const UTIL_storage = {
    getStr(key, fallback = null) {
      try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
    },
    setStr(key, val) {
      try { localStorage.setItem(key, String(val)); return true; } catch { return false; }
    },
    getJSON(key, fallback = null) {
      const s = this.getStr(key, null);
      if (s == null) return fallback;
      try { return JSON.parse(s); } catch { return fallback; }
    },
    setJSON(key, obj) {
      try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch { return false; }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch {}
    },
  };

  function UTIL_parseHslString(hslStr) {
    if (!hslStr) return { h: 260, s: 55, l: 60 };
    const parts = String(hslStr).split(',');
    if (parts.length < 3) return { h: 260, s: 55, l: 60 };
    const h = parseFloat(parts[0].trim());
    const s = parseFloat(parts[1].replace('%', '').trim());
    const l = parseFloat(parts[2].replace('%', '').trim());
    return {
      h: Number.isFinite(h) ? h : 260,
      s: Number.isFinite(s) ? s : 55,
      l: Number.isFinite(l) ? l : 60,
    };
  }

  function UTIL_dispatchEvt(topic, detail) {
    try { W.dispatchEvent(new CustomEvent(topic, { detail })); } catch {}
    try {
      const bus = W.H2O?.bus;
      if (bus && typeof bus.emit === 'function') bus.emit(topic, detail);
      if (bus && typeof bus.dispatch === 'function') bus.dispatch(topic, detail);
    } catch {}
  }

  function UTIL_recordDiagError(err) {
    try {
      const diag = W.H2O?.[TOK]?.[BrID]?.diag;
      if (!diag?.errors) return;
      diag.errors.push(String(err?.stack || err));
      if (diag.errors.length > (diag.errMax || 30)) diag.errors.shift();
    } catch {}
  }

  /* ───────────────────────────── 🔴 STATE — REGISTRIES / CACHES 📄🔓💧 ───────────────────────────── */

  const STATE = {
    settings: null,

    panelBackdrop: null,
    panelEl: null,
    panelDragCleanup: null,
    panelPos: null,
    nativeSyncObserver: null,
    nativeSyncTimer: 0,
    nativeApplyTimer: 0,
    nativeApplyBusy: false,
    nativePending: null,
    chatTargetTimer: 0,
    pendingHtmlMutation: null,
    htmlMutationScheduled: false,
    sidebarMoreGuardRaf: 0,
    sidebarMoreGuardBound: false,
    sidebarMoreGuardHandler: null,

    booted: false,
    disposed: false,

    // tiny rail wiring
    moTinyRail: null,
    rafTinyRail: 0,
    dockTabTimer: 0,
    dockTabRegistered: false,
    onResize: null,
    onPop: null,
    tinyRailWrap: null,
  };

  /* ───────────────────────────── 🟥 ENGINE — DOMAIN LOGIC / PIPELINE 📝🔓💥 ───────────────────────────── */

  const MODE_PRESETS = Object.freeze([
    Object.freeze({ key: 'system', name: 'System' }),
    Object.freeze({ key: 'light',  name: 'Light' }),
    Object.freeze({ key: 'dark',   name: 'Dark' }),
  ]);

  const FONT_PRESETS = Object.freeze([
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

  const FONT_PRESET_MAP = Object.freeze(
    FONT_PRESETS.reduce((acc, preset) => {
      acc[preset.key] = preset;
      return acc;
    }, Object.create(null))
  );

  const FONT_STACKS = Object.freeze({
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

  const FONT_SCOPE_PRESETS = Object.freeze([
    Object.freeze({ key: 'chat', name: 'Chat Only', hint: 'Messages and composer only.' }),
    Object.freeze({ key: 'page', name: 'Entire ChatGPT Page', hint: 'ChatGPT shell only.' }),
  ]);

  const FONT_SCOPE_MAP = Object.freeze(
    FONT_SCOPE_PRESETS.reduce((acc, preset) => {
      acc[preset.key] = preset;
      return acc;
    }, Object.create(null))
  );

  const THEME_PRESETS = Object.freeze([
    Object.freeze({ key: 'lavender', name: 'Lavender', light: '260, 55%, 78%', dark: '260, 45%, 62%' }),
    Object.freeze({ key: 'coral',    name: 'Coral',    light: '12, 70%, 72%',  dark: '12, 60%, 55%' }),
    Object.freeze({ key: 'aqua',     name: 'Aqua',     light: '188, 55%, 70%', dark: '188, 50%, 50%' }),
    Object.freeze({ key: 'emerald',  name: 'Emerald',  light: '152, 45%, 68%', dark: '152, 40%, 48%' }),
    Object.freeze({ key: 'amber',    name: 'Amber',    light: '40, 70%, 72%',  dark: '36, 65%, 52%' }),
    Object.freeze({ key: 'rose',     name: 'Rose',     light: '338, 60%, 72%', dark: '338, 52%, 54%' }),
    Object.freeze({ key: 'slate',    name: 'Slate',    light: '220, 18%, 70%', dark: '220, 18%, 46%' }),
  ]);

  const THEME_PRESET_MAP = Object.freeze(
    THEME_PRESETS.reduce((acc, preset) => {
      acc[preset.key] = preset;
      return acc;
    }, {})
  );

  const NATIVE_ACCENT_PRESETS = Object.freeze([
    Object.freeze({ key: 'default', name: 'Default', light: '152, 45%, 68%', dark: '152, 40%, 48%' }),
    Object.freeze({ key: 'green',   name: 'Green',   light: '152, 45%, 68%', dark: '152, 40%, 48%' }),
    Object.freeze({ key: 'blue',    name: 'Blue',    light: '188, 55%, 70%', dark: '188, 50%, 50%' }),
    Object.freeze({ key: 'yellow',  name: 'Yellow',  light: '40, 70%, 72%',  dark: '36, 65%, 52%' }),
    Object.freeze({ key: 'orange',  name: 'Orange',  light: '12, 70%, 72%',  dark: '12, 60%, 55%' }),
    Object.freeze({ key: 'pink',    name: 'Pink',    light: '338, 60%, 72%', dark: '338, 52%, 54%' }),
    Object.freeze({ key: 'purple',  name: 'Purple',  light: '260, 55%, 78%', dark: '260, 45%, 62%' }),
  ]);

  const NATIVE_ACCENT_MAP = Object.freeze(
    NATIVE_ACCENT_PRESETS.reduce((acc, preset) => {
      acc[preset.key] = preset;
      return acc;
    }, {})
  );

  function CORE_TP_normalizeMode(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'light' || value === 'dark' || value === 'system') return value;
    return 'system';
  }

  function CORE_TP_normalizeThemePreset(raw) {
    const value = String(raw || '').trim().toLowerCase();
    return THEME_PRESET_MAP[value] ? value : 'lavender';
  }

  function CORE_TP_resolveThemePreset(raw) {
    return THEME_PRESET_MAP[CORE_TP_normalizeThemePreset(raw)] || THEME_PRESET_MAP.lavender;
  }

  function CORE_TP_inferThemePresetKey(accentLight, accentDark) {
    const light = String(accentLight || '').trim();
    const dark = String(accentDark || '').trim();
    const hit = THEME_PRESETS.find((preset) => preset.light === light && preset.dark === dark);
    return hit?.key || 'lavender';
  }

  function CORE_TP_applyThemePreset(target, themeKey) {
    const preset = CORE_TP_resolveThemePreset(themeKey);
    target.themePreset = preset.key;
    target.accentLight = preset.light;
    target.accentDark = preset.dark;
    return preset;
  }

  function CORE_TP_normalizeNativeAccent(raw) {
    const value = String(raw || '').trim().toLowerCase();
    return NATIVE_ACCENT_MAP[value] ? value : 'default';
  }

  function CORE_TP_normalizeFontFamily(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'default') return 'system';
    if (value === 'readable-sans') return 'readable';
    if (value === 'serif-reading') return 'serif';
    if (value === 'premiumserif' || value === 'premium-serif-reading') return 'premium-serif';
    if (value === 'humanist-sans') return 'humanist';
    return FONT_PRESET_MAP[value] ? value : DEFAULT_SETTINGS.fontFamily;
  }

  function CORE_TP_normalizeFontScope(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'all' || value === 'full' || value === 'entire') return 'page';
    return FONT_SCOPE_MAP[value] ? value : DEFAULT_SETTINGS.fontScope;
  }

  function CORE_TP_clampNumber(raw, fallback, min, max, precision = 0) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    const clamped = Math.min(max, Math.max(min, n));
    return precision > 0 ? Number(clamped.toFixed(precision)) : Math.round(clamped);
  }

  const DEFAULT_SETTINGS = {
    enabled: true,
    mode: 'system', // 'system' | 'light' | 'dark'
    themePreset: 'lavender',
    nativeAccent: 'default',
    accentLight: '260, 55%, 78%',
    accentDark:  '260, 45%, 62%',

    fontFamily: 'system', // 'system' | 'inter' | 'readable' | 'optima' | 'avenir' | 'humanist' | 'serif' | 'premium-serif' | 'mono'
    fontScope: 'chat', // 'chat' | 'page'
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

    bubblesUser: false,
    bubblesGpt:  false,

    scrollAlign: 'right',
  };

  function CORE_TP_loadSettings() {
    const normalizeLoaded = (raw) => {
      const merged = { ...DEFAULT_SETTINGS, ...raw };
      merged.mode = CORE_TP_normalizeMode(merged.mode);
      merged.themePreset = CORE_TP_normalizeThemePreset(merged.themePreset || CORE_TP_inferThemePresetKey(merged.accentLight, merged.accentDark));
      CORE_TP_applyThemePreset(merged, merged.themePreset);
      merged.nativeAccent = CORE_TP_normalizeNativeAccent(merged.nativeAccent);
      merged.fontFamily = CORE_TP_normalizeFontFamily(merged.fontFamily);
      merged.fontScope = CORE_TP_normalizeFontScope(merged.fontScope);
      return merged;
    };

    const diskObj = UTIL_storage.getJSON(KEY_TPANEL_UI_SETTINGS_V2, null);
    if (diskObj && typeof diskObj === 'object') return normalizeLoaded(diskObj);

    const legacyObj = UTIL_storage.getJSON(KEY_TPANEL_LEGACY_SETTINGS, null);
    if (legacyObj && typeof legacyObj === 'object') {
      const merged = normalizeLoaded(legacyObj);
      UTIL_storage.setJSON(KEY_TPANEL_UI_SETTINGS_V2, merged);
      UTIL_storage.setJSON(KEY_TPANEL_LEGACY_SETTINGS, merged);
      return merged;
    }
    return normalizeLoaded(DEFAULT_SETTINGS);
  }

  function CORE_TP_saveSettings() {
    UTIL_storage.setJSON(KEY_TPANEL_UI_SETTINGS_V2, STATE.settings);
    UTIL_storage.setJSON(KEY_TPANEL_LEGACY_SETTINGS, STATE.settings); // legacy mirror (kept)

    UTIL_dispatchEvt(EV_TPANEL_SETTINGS_CHANGED, { ...STATE.settings });
  }

  function CORE_TP_resetSection(section) {
    const S = STATE.settings;
    if (section === 'color') {
      S.mode = DEFAULT_SETTINGS.mode;
      CORE_TP_applyThemePreset(S, DEFAULT_SETTINGS.themePreset);
      S.nativeAccent = DEFAULT_SETTINGS.nativeAccent;
    } else if (section === 'font') {
      S.fontFamily = DEFAULT_SETTINGS.fontFamily;
      S.fontScope = DEFAULT_SETTINGS.fontScope;
      S.fontSize = DEFAULT_SETTINGS.fontSize;
      S.lineHeight = DEFAULT_SETTINGS.lineHeight;
      S.letterSpace = DEFAULT_SETTINGS.letterSpace;
    } else if (section === 'layout') {
      S.chatWidth = DEFAULT_SETTINGS.chatWidth;
      S.promptWidth = DEFAULT_SETTINGS.promptWidth;
      S.chatFullWidth = DEFAULT_SETTINGS.chatFullWidth;
      S.syncPromptWidth = DEFAULT_SETTINGS.syncPromptWidth;
      S.hideHeader = DEFAULT_SETTINGS.hideHeader;
      S.hideFooter = DEFAULT_SETTINGS.hideFooter;
      S.expandChatbox = DEFAULT_SETTINGS.expandChatbox;
      S.bubblesUser = DEFAULT_SETTINGS.bubblesUser;
      S.bubblesGpt = DEFAULT_SETTINGS.bubblesGpt;
      S.scrollAlign = DEFAULT_SETTINGS.scrollAlign;
    }
    CORE_TP_saveSettings();
    DOM_TP_applySettings();
  }

  /* ───────────────────────────── 🟤 VERIFY/SAFETY — HARDENING 📝🔓💧 ───────────────────────────── */

  function SAFE_hasNode(id) {
    try { return !!D.getElementById(id); } catch { return false; }
  }

  function UTIL_normText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function UTIL_isVisible(el) {
    if (!(el instanceof Element)) return false;
    return !!(el.getClientRects?.().length);
  }

  function UTIL_wait(ms) {
    return new Promise((resolve) => W.setTimeout(resolve, ms));
  }

  function UTIL_escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[ch] || ch);
  }

  const NATIVE_MODE_ALIASES = Object.freeze({
    system: Object.freeze(['system']),
    light:  Object.freeze(['light']),
    dark:   Object.freeze(['dark']),
  });

  const NATIVE_ACCENT_ALIASES = Object.freeze({
    default: Object.freeze(['default']),
    green:   Object.freeze(['green']),
    blue:    Object.freeze(['blue']),
    yellow:  Object.freeze(['yellow']),
    orange:  Object.freeze(['orange']),
    pink:    Object.freeze(['pink', 'magenta']),
    purple:  Object.freeze(['purple', 'violet']),
  });

  function NATIVE_matchKey(rawValue, aliases) {
    const value = UTIL_normText(rawValue);
    return Object.keys(aliases).find((key) => aliases[key].some(alias => value === alias || value.includes(alias))) || null;
  }

  function NATIVE_findGeneralDialog() {
    const dialogs = Array.from(D.querySelectorAll('[role="dialog"], dialog')).filter(UTIL_isVisible);
    return dialogs.find((el) => {
      const text = UTIL_normText(el.textContent);
      return text.includes('general') && text.includes('appearance') && text.includes('accent color');
    }) || dialogs.find((el) => {
      const text = UTIL_normText(el.textContent);
      return text.includes('appearance') && text.includes('accent color');
    }) || null;
  }

  function NATIVE_findSettingRow(root, label) {
    if (!root) return null;
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const candidates = Array.from(root.querySelectorAll('button, [role="button"], div, section, li'));
    candidates.forEach((el) => {
      const text = UTIL_normText(el.textContent);
      if (!text || !text.includes(label)) return;
      const trigger = el.matches?.('button, [role="button"]') ? el : el.querySelector?.('button, [role="button"]');
      if (!trigger || !UTIL_isVisible(trigger)) return;
      const score = text.length;
      if (score < bestScore) {
        best = el;
        bestScore = score;
      }
    });
    return best;
  }

  function NATIVE_getRowTrigger(row) {
    if (!row) return null;
    if (row.matches?.('button, [role="button"]')) return row;
    return row.querySelector?.('button, [role="button"]') || null;
  }

  function NATIVE_extractValueFromTrigger(trigger, label) {
    if (!trigger) return '';
    const lines = String(trigger.innerText || trigger.textContent || '')
      .split(/\n+/)
      .map(line => line.trim())
      .filter(Boolean);
    const labelNorm = UTIL_normText(label);
    const filtered = lines.filter(line => UTIL_normText(line) !== labelNorm);
    return filtered[filtered.length - 1] || '';
  }

  function NATIVE_findOpenPopup() {
    const candidates = Array.from(D.querySelectorAll(
      '[role="listbox"], [role="menu"], [data-radix-select-content], [data-radix-popper-content-wrapper]'
    )).filter(UTIL_isVisible);
    return candidates[candidates.length - 1] || null;
  }

  function NATIVE_listPopupOptions(popup) {
    if (!popup) return [];
    const items = Array.from(popup.querySelectorAll(
      'button, [role="option"], [role="menuitem"], [role="menuitemradio"], [role="radio"], [aria-checked], [data-state], [data-radix-collection-item]'
    )).filter(UTIL_isVisible);
    const out = [];
    const seen = new Set();
    items.forEach((el) => {
      const clickEl =
        (el.matches?.('button, [role="option"], [role="menuitem"], [role="menuitemradio"], [role="radio"]') ? el : null)
        || el.querySelector?.('button, [role="option"], [role="menuitem"], [role="menuitemradio"], [role="radio"]')
        || el;
      const text = String(clickEl.innerText || el.innerText || clickEl.textContent || el.textContent || '').trim();
      if (!text || text.length > 60) return;
      const key = UTIL_normText(text);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({ el: clickEl, text, key });
    });
    return out;
  }

  function NATIVE_readSetting(root, label, aliases) {
    const row = NATIVE_findSettingRow(root, label);
    const trigger = NATIVE_getRowTrigger(row);
    const rawValue = NATIVE_extractValueFromTrigger(trigger, label);
    return NATIVE_matchKey(rawValue, aliases);
  }

  async function NATIVE_openSettingPicker(root, label) {
    const row = NATIVE_findSettingRow(root, label);
    const trigger = NATIVE_getRowTrigger(row);
    if (!trigger) return null;
    trigger.click();
    await UTIL_wait(120);
    return trigger;
  }

  async function NATIVE_applySetting(kind, targetKey) {
    const root = NATIVE_findGeneralDialog();
    if (!root) return false;
    const label = kind === 'mode' ? 'appearance' : 'accent color';
    const aliases = kind === 'mode' ? NATIVE_MODE_ALIASES : NATIVE_ACCENT_ALIASES;
    const targets = aliases[targetKey] || [targetKey];
    const findHit = (popup) => NATIVE_listPopupOptions(popup)
      .find((item) => targets.some(alias => item.key === alias || item.key.includes(alias)));

    let popup = NATIVE_findOpenPopup();
    let hit = popup ? findHit(popup) : null;
    if (!hit) {
      await NATIVE_openSettingPicker(root, label);
      await UTIL_wait(120);
      popup = NATIVE_findOpenPopup();
      hit = popup ? findHit(popup) : null;
    }
    if (!hit) return false;
    hit.el.click();
    await UTIL_wait(140);
    return true;
  }

  function NATIVE_syncFromDialog() {
    if (STATE.nativeApplyBusy || !STATE.settings) return false;
    const root = NATIVE_findGeneralDialog();
    if (!root) return false;
    const mode = NATIVE_readSetting(root, 'appearance', NATIVE_MODE_ALIASES);
    const accent = NATIVE_readSetting(root, 'accent color', NATIVE_ACCENT_ALIASES);
    let changed = false;
    if (mode && STATE.settings.mode !== mode) {
      STATE.settings.mode = mode;
      changed = true;
    }
    if (accent && STATE.settings.nativeAccent !== accent) {
      STATE.settings.nativeAccent = CORE_TP_normalizeNativeAccent(accent);
      changed = true;
    }
    if (changed) {
      CORE_TP_saveSettings();
      DOM_TP_applySettings();
      UI_TP_refreshColorPaneIfOpen();
    }
    return changed;
  }

  function NATIVE_scheduleSync() {
    if (STATE.nativeSyncTimer) W.clearTimeout(STATE.nativeSyncTimer);
    STATE.nativeSyncTimer = W.setTimeout(() => {
      STATE.nativeSyncTimer = 0;
      NATIVE_syncFromDialog();
    }, 140);
  }

  async function NATIVE_applyPending() {
    if (STATE.nativeApplyBusy || !STATE.nativePending) return false;
    if (!NATIVE_findGeneralDialog()) return false;
    const pending = { ...STATE.nativePending };
    STATE.nativeApplyBusy = true;
    let appliedAny = false;
    try {
      const modeApplied = pending.mode ? await NATIVE_applySetting('mode', pending.mode) : false;
      const accentApplied = pending.accent ? await NATIVE_applySetting('accent', pending.accent) : false;
      appliedAny = modeApplied || accentApplied;
      if (appliedAny) {
        const nextPending = { ...(STATE.nativePending || {}) };
        if (modeApplied && pending.mode === nextPending.mode) delete nextPending.mode;
        if (accentApplied && pending.accent === nextPending.accent) delete nextPending.accent;
        STATE.nativePending = Object.keys(nextPending).length ? nextPending : null;
      }
    } finally {
      STATE.nativeApplyBusy = false;
      if (appliedAny) NATIVE_scheduleSync();
      else if (STATE.nativePending && NATIVE_findGeneralDialog()) NATIVE_scheduleApply();
    }
    return appliedAny;
  }

  function NATIVE_scheduleApply() {
    if (STATE.nativeApplyTimer) return;
    STATE.nativeApplyTimer = W.setTimeout(() => {
      STATE.nativeApplyTimer = 0;
      void NATIVE_applyPending();
    }, 180);
  }

  function NATIVE_queueSetting(kind, value) {
    STATE.nativePending = { ...(STATE.nativePending || {}), [kind]: value };
    NATIVE_scheduleApply();
  }

  function NATIVE_bootSyncObserver() {
    if (STATE.nativeSyncObserver) return;
    STATE.nativeSyncObserver = new MutationObserver(() => {
      NATIVE_scheduleSync();
      NATIVE_scheduleApply();
      DOM_TP_scheduleChatTargetResolve();
    });
    try {
      STATE.nativeSyncObserver.observe(D.documentElement, { childList: true, subtree: true });
    } catch {}
  }

  /* ───────────────────────────── 🟧 BOUNDARIES — DOM / IO ADAPTERS 📝🔓💥 ───────────────────────────── */

  // cgxui scoped selector helper (owned only)
  function DOM_selScoped(uiToken) {
    return `[${ATTR_CGXUI}="${uiToken}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;
  }

  function DOM_TP_isEl(node) {
    return !!(node && node.nodeType === 1);
  }

  function DOM_TP_attrSummary(node) {
    if (!DOM_TP_isEl(node)) return '';
    const names = [
      'id',
      'role',
      'data-testid',
      'data-message-author-role',
      ATTR_CGXUI,
      ATTR_CGXUI_OWNER,
      'data-h2o-owner',
      'data-h2o-library-workspace',
      'data-cgxui-page-kind',
    ];
    const out = [];
    for (const name of names) {
      try {
        const value = node.getAttribute?.(name);
        if (value != null && value !== '') out.push(`${name}=${String(value).slice(0, 80)}`);
      } catch {}
    }
    return out.join(' ');
  }

  function DOM_TP_classSummary(node) {
    if (!DOM_TP_isEl(node)) return '';
    try {
      const raw = typeof node.className === 'string' ? node.className : String(node.getAttribute?.('class') || '');
      return raw.trim().replace(/\s+/g, ' ').slice(0, 160);
    } catch {
      return '';
    }
  }

  function DOM_TP_getAttr(node, attr) {
    if (!DOM_TP_isEl(node)) return '';
    try { return String(node.getAttribute?.(attr) || ''); } catch { return ''; }
  }

  function DOM_TP_findNativeContext(node) {
    if (!DOM_TP_isEl(node)) return null;
    try {
      const prompt = D.getElementById?.('prompt-textarea') || null;
      if (prompt && (node === prompt || prompt.contains?.(node) || node.contains?.(prompt))) return prompt;
    } catch {}

    try {
      const form = node.closest?.('form') || null;
      if (form?.querySelector?.('#prompt-textarea')) return form;
    } catch {}

    try {
      return node.closest?.(SEL_CHATGPT_NATIVE_CONTEXT) || null;
    } catch {
      return null;
    }
  }

  function DOM_TP_isChatGPTHelperNode(node, nativeContext = null) {
    if (!DOM_TP_isEl(node)) return false;
    if (!nativeContext) return false;
    const owner = DOM_TP_getAttr(node, ATTR_CGXUI_OWNER).trim();
    if (H2O_CHATGPT_HELPER_OWNERS.includes(owner)) return true;
    const cgxui = DOM_TP_getAttr(node, ATTR_CGXUI).trim();
    if (cgxui && /^(?:qbig|ansn|abig|atns|ats|qts|mrnc|qswr)-/.test(cgxui)) return true;
    return H2O_CHATGPT_HELPER_CLASS_RE.test(DOM_TP_classSummary(node));
  }

  function DOM_TP_findH2OOwnershipMatch(node) {
    if (!DOM_TP_isEl(node)) return null;
    const nativeContext = DOM_TP_findNativeContext(node);
    let cur = node;
    while (DOM_TP_isEl(cur) && cur !== D.documentElement && cur !== D.body) {
      if (DOM_TP_isChatGPTHelperNode(cur, nativeContext)) {
        cur = cur.parentElement;
        continue;
      }
      for (const selector of H2O_OWNED_ROOT_SELECTORS) {
        try {
          if (cur.matches?.(selector)) {
            return { matchedExclusion: selector, matchedAncestor: cur };
          }
        } catch {
          return { matchedExclusion: `selector-error:${selector}`, matchedAncestor: cur };
        }
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function DOM_TP_recordH2OSkip(stats, node, match) {
    if (!stats) return;
    stats.skippedH2OOwned = Number(stats.skippedH2OOwned || 0) + 1;
    if (!Array.isArray(stats.skipSamples)) stats.skipSamples = [];
    if (stats.skipSamples.length >= 8) return;

    const ancestor = match?.matchedAncestor || null;
    stats.skipSamples.push({
      tag: String(node?.tagName || '').toLowerCase(),
      role: String(node?.getAttribute?.('role') || ''),
      testid: String(node?.getAttribute?.('data-testid') || ''),
      owner: DOM_TP_getAttr(node, ATTR_CGXUI_OWNER),
      cgxui: DOM_TP_getAttr(node, ATTR_CGXUI),
      className: DOM_TP_classSummary(node),
      matchedExclusion: String(match?.matchedExclusion || ''),
      matchedAncestorTag: String(ancestor?.tagName || '').toLowerCase(),
      matchedAncestorOwner: DOM_TP_getAttr(ancestor, ATTR_CGXUI_OWNER),
      matchedAncestorCgxui: DOM_TP_getAttr(ancestor, ATTR_CGXUI),
      matchedAncestorAttrs: DOM_TP_attrSummary(ancestor),
    });
  }

  function DOM_TP_isH2OOwned(node, stats = null) {
    if (!DOM_TP_isEl(node)) return true;
    const match = DOM_TP_findH2OOwnershipMatch(node);
    if (!match) return false;
    DOM_TP_recordH2OSkip(stats, node, match);
    return true;
  }

  function DOM_TP_isVisible(node) {
    if (!DOM_TP_isEl(node)) return false;
    try {
      const cs = W.getComputedStyle(node);
      if (cs?.display === 'none' || cs?.visibility === 'hidden') return false;
      const r = node.getBoundingClientRect();
      return !!(r && r.width > 0 && r.height > 0);
    } catch {
      return true;
    }
  }

  function DOM_TP_scoreBottomLane(node) {
    if (!DOM_TP_isEl(node)) return 0;
    try {
      const r = node.getBoundingClientRect();
      const vh = Math.max(1, Number(W.innerHeight) || 0);
      if (!r || !Number.isFinite(r.bottom)) return 0;
      const dist = Math.abs(vh - r.bottom);
      return Math.max(0, 420 - dist) / 70;
    } catch {
      return 0;
    }
  }

  function DOM_TP_markOwned(node, attr, stats = null) {
    if (!DOM_TP_isEl(node)) return false;
    if (DOM_TP_isH2OOwned(node, stats)) return false;
    try {
      if (node.getAttribute(attr) !== 'true') node.setAttribute(attr, 'true');
      return true;
    } catch {
      return false;
    }
  }

  function DOM_TP_clearInvalidTargetMarks() {
    const attrs = [
      ATTR_HO_CHAT_ROOT,
      ATTR_HO_CHAT_COLUMN,
      ATTR_HO_MESSAGE_TEXT,
      ATTR_HO_COMPOSER,
      ATTR_HO_COMPOSER_INPUT,
      ATTR_HO_CHATGPT_HEADER,
      ATTR_HO_CHATGPT_SIDEBAR,
      ATTR_HO_CHATGPT_FOOTER,
      ATTR_HO_SCROLL_BUTTON,
      ATTR_HO_SIDEBAR_TOP_MORE,
    ];
    for (const attr of attrs) {
      let nodes = [];
      try { nodes = Array.from(D.querySelectorAll(`[${attr}="true"]`)); } catch { nodes = []; }
      for (const node of nodes) {
        if (!DOM_TP_isEl(node) || !D.documentElement.contains(node) || DOM_TP_isH2OOwned(node)) {
          try { node.removeAttribute(attr); } catch {}
        }
      }
    }
  }

  function DOM_TP_sidebarTopGuardBottom(sidebar) {
    if (!DOM_TP_isEl(sidebar)) return 0;
    let sidebarRect = null;
    try { sidebarRect = sidebar.getBoundingClientRect(); } catch {}
    const sidebarTop = Number(sidebarRect?.top) || 0;
    let bottom = sidebarTop + 280;
    let candidates = [];
    try { candidates = Array.from(sidebar.querySelectorAll('a, button, [role="button"], [data-sidebar-item="true"]')); } catch { candidates = []; }
    const fixedLabels = new Set(['library', 'new chat', 'search chats', 'codex']);
    for (const el of candidates) {
      if (!DOM_TP_isEl(el) || DOM_TP_isH2OOwned(el) || !DOM_TP_isVisible(el)) continue;
      const text = String(el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const aria = DOM_TP_getAttr(el, 'aria-label').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!fixedLabels.has(text) && !fixedLabels.has(aria)) continue;
      try {
        const r = el.getBoundingClientRect();
        const relTop = r.top - sidebarTop;
        if (Number.isFinite(relTop) && relTop >= 0 && relTop <= 420) {
          bottom = Math.max(bottom, r.bottom + 8);
        }
      } catch {}
    }
    return bottom;
  }

  function DOM_TP_updateSidebarMoreGuard() {
    let rows = [];
    try { rows = Array.from(D.querySelectorAll(`[${ATTR_HO_SIDEBAR_TOP_MORE}="true"]`)); } catch { rows = []; }
    for (const row of rows) {
      if (!DOM_TP_isEl(row)) continue;
      const sidebar = row.closest?.(`[${ATTR_HO_CHATGPT_SIDEBAR}="true"]`) || row.closest?.(SEL_CHATGPT_SIDEBAR);
      if (!DOM_TP_isEl(sidebar)) continue;
      let shouldHide = false;
      try {
        const r = row.getBoundingClientRect();
        const guardBottom = DOM_TP_sidebarTopGuardBottom(sidebar);
        shouldHide = r.top < guardBottom && r.bottom > 0;
      } catch {}
      try {
        if (shouldHide) row.setAttribute(ATTR_HO_SIDEBAR_MORE_HIDDEN, 'true');
        else row.removeAttribute(ATTR_HO_SIDEBAR_MORE_HIDDEN);
      } catch {}
    }
  }

  function DOM_TP_scheduleSidebarMoreGuard() {
    if (STATE.disposed || STATE.sidebarMoreGuardRaf) return;
    const raf = typeof W.requestAnimationFrame === 'function'
      ? W.requestAnimationFrame.bind(W)
      : (cb) => W.setTimeout(cb, 16);
    STATE.sidebarMoreGuardRaf = raf(() => {
      STATE.sidebarMoreGuardRaf = 0;
      DOM_TP_updateSidebarMoreGuard();
    });
  }

  function DOM_TP_wireSidebarMoreGuard() {
    if (STATE.sidebarMoreGuardBound) {
      DOM_TP_scheduleSidebarMoreGuard();
      return;
    }
    STATE.sidebarMoreGuardBound = true;
    STATE.sidebarMoreGuardHandler = () => DOM_TP_scheduleSidebarMoreGuard();
    try { D.addEventListener('scroll', STATE.sidebarMoreGuardHandler, true); } catch {}
    try { W.addEventListener(EV_WIN_RESIZE, STATE.sidebarMoreGuardHandler, { passive: true }); } catch {}
    try { W.visualViewport?.addEventListener?.('scroll', STATE.sidebarMoreGuardHandler, { passive: true }); } catch {}
    DOM_TP_scheduleSidebarMoreGuard();
  }

  function DOM_TP_unwireSidebarMoreGuard() {
    try {
      if (STATE.sidebarMoreGuardBound && STATE.sidebarMoreGuardHandler) {
        D.removeEventListener('scroll', STATE.sidebarMoreGuardHandler, true);
        W.removeEventListener(EV_WIN_RESIZE, STATE.sidebarMoreGuardHandler);
        W.visualViewport?.removeEventListener?.('scroll', STATE.sidebarMoreGuardHandler);
      }
    } catch {}
    if (STATE.sidebarMoreGuardRaf) {
      try { W.cancelAnimationFrame?.(STATE.sidebarMoreGuardRaf); } catch {}
    }
    STATE.sidebarMoreGuardRaf = 0;
    STATE.sidebarMoreGuardBound = false;
    STATE.sidebarMoreGuardHandler = null;
    try {
      for (const row of Array.from(D.querySelectorAll(`[${ATTR_HO_SIDEBAR_MORE_HIDDEN}="true"]`))) {
        row.removeAttribute(ATTR_HO_SIDEBAR_MORE_HIDDEN);
      }
    } catch {}
  }

  function DOM_TP_pickComposerInput(formHint = null, stats = null) {
    const prompt = D.getElementById?.('prompt-textarea') || null;
    if (prompt && !DOM_TP_isH2OOwned(prompt, stats) && DOM_TP_isVisible(prompt)) {
      const promptForm = prompt.closest?.('form') || null;
      if (!formHint || promptForm === formHint) return prompt;
    }

    const scope = formHint || D;
    let candidates = [];
    try { candidates = Array.from(scope.querySelectorAll(SEL_COMPOSER_INPUT)); } catch { candidates = []; }

    let best = null;
    let bestScore = -Infinity;
    for (const el of candidates) {
      if (!DOM_TP_isEl(el) || DOM_TP_isH2OOwned(el, stats) || !DOM_TP_isVisible(el)) continue;

      const hostForm = el.closest?.('form') || null;
      const aria = String(el.getAttribute?.('aria-label') || '').toLowerCase();
      const placeholder = String(el.getAttribute?.('placeholder') || '').toLowerCase();
      const looksMessageInput = (
        el.id === 'prompt-textarea' ||
        aria.includes('message') ||
        placeholder.includes('message')
      );
      if (!hostForm && !looksMessageInput) continue;

      let score = 0;
      if (el.id === 'prompt-textarea') score += 12;
      if (el.tagName === 'TEXTAREA') score += 3;
      if (String(el.getAttribute?.('contenteditable') || '').toLowerCase() === 'true') score += 3;
      if (String(el.getAttribute?.('role') || '').toLowerCase() === 'textbox') score += 2;
      if (looksMessageInput) score += 3;
      if (hostForm && formHint && hostForm === formHint) score += 8;
      if (hostForm?.matches?.(SEL_COMPOSER_FORM)) score += 6;
      if (hostForm?.querySelector?.(SEL_COMPOSER_SEND_BTN)) score += 4;
      score += DOM_TP_scoreBottomLane(el);

      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }

    return bestScore >= 5 ? best : null;
  }

  function DOM_TP_pickComposerForm(stats = null) {
    const prompt = D.getElementById?.('prompt-textarea') || null;
    const promptForm = prompt?.closest?.('form') || null;
    if (promptForm && !DOM_TP_isH2OOwned(promptForm, stats) && DOM_TP_isVisible(promptForm)) return promptForm;

    let forms = [];
    try { forms = Array.from(D.querySelectorAll(SEL_COMPOSER_FORM)); } catch { forms = []; }

    let best = null;
    let bestScore = -Infinity;
    for (const form of forms) {
      if (!DOM_TP_isEl(form) || DOM_TP_isH2OOwned(form, stats) || !DOM_TP_isVisible(form)) continue;
      const hasSend = !!form.querySelector?.(SEL_COMPOSER_SEND_BTN);
      const hasInput = !!DOM_TP_pickComposerInput(form, stats);
      if (!hasSend && !hasInput) continue;

      let score = 0;
      if (form.matches?.('form[data-type="unified-composer"], form.group\\/composer')) score += 13;
      if (form.matches?.('form[data-testid="composer"]')) score += 12;
      if (form.querySelector?.('#prompt-textarea')) score += 10;
      if (form.matches?.('form[action*="conversation"]')) score += 8;
      if (hasSend) score += 6;
      if (hasInput) score += 4;
      score += DOM_TP_scoreBottomLane(form);

      if (score > bestScore) {
        best = form;
        bestScore = score;
      }
    }

    if (best && bestScore >= 8) return best;

    const fallbackInput = DOM_TP_pickComposerInput(null, stats);
    const fallbackForm = fallbackInput?.closest?.('form') || null;
    if (fallbackForm && !DOM_TP_isH2OOwned(fallbackForm, stats) && DOM_TP_isVisible(fallbackForm)) return fallbackForm;

    return null;
  }

  function DOM_TP_containsAll(root, nodes) {
    if (!DOM_TP_isEl(root)) return false;
    const list = Array.isArray(nodes) ? nodes : [];
    if (!list.length) return false;
    return list.every((node) => DOM_TP_isEl(node) && (root === node || root.contains?.(node)));
  }

  function DOM_TP_commonAncestor(nodes, stop = null) {
    const list = (Array.isArray(nodes) ? nodes : []).filter(DOM_TP_isEl);
    if (!list.length) return null;
    let cur = list[0];
    while (DOM_TP_isEl(cur) && cur !== D.documentElement && cur !== D.body) {
      if (DOM_TP_containsAll(cur, list)) return cur;
      if (stop && cur === stop) break;
      cur = cur.parentElement;
    }
    return null;
  }

  function DOM_TP_messageLayoutHost(msg) {
    if (!DOM_TP_isEl(msg)) return null;
    try {
      return (
        msg.closest?.('[data-testid^="conversation-turn"]') ||
        msg.closest?.('article') ||
        msg
      );
    } catch {
      return msg;
    }
  }

  function DOM_TP_pickChatColumns(messages, chatRoot, stats = null) {
    const msgHosts = (Array.isArray(messages) ? messages : [])
      .filter((msg) => DOM_TP_isEl(msg) && !DOM_TP_isH2OOwned(msg, stats))
      .map(DOM_TP_messageLayoutHost)
      .filter(DOM_TP_isEl)
      .filter((host) => !DOM_TP_isH2OOwned(host, stats));

    if (!msgHosts.length) return [];

    const common = DOM_TP_commonAncestor(msgHosts, chatRoot);
    if (DOM_TP_isEl(common) && common !== chatRoot && !DOM_TP_isH2OOwned(common, stats)) return [common];

    if (DOM_TP_isEl(chatRoot) && DOM_TP_containsAll(chatRoot, msgHosts)) {
      let child = msgHosts[0];
      let best = null;
      while (DOM_TP_isEl(child) && child.parentElement && child.parentElement !== chatRoot) {
        if (DOM_TP_containsAll(child, msgHosts)) best = child;
        child = child.parentElement;
      }
      if (DOM_TP_isEl(best) && !DOM_TP_isH2OOwned(best, stats)) return [best];
    }

    return [...new Set(msgHosts)];
  }

  function DOM_TP_pickChatGptHeader(stats = null) {
    let candidates = [];
    try { candidates = Array.from(D.querySelectorAll(SEL_CHATGPT_HEADER)); } catch { candidates = []; }

    let best = null;
    let bestScore = -Infinity;
    for (const el of candidates) {
      if (!DOM_TP_isEl(el) || DOM_TP_isH2OOwned(el, stats) || !DOM_TP_isVisible(el)) continue;
      if (DOM_TP_findNativeContext(el)) continue;
      if (el.closest?.('form')) continue;

      let score = 0;
      const tag = String(el.tagName || '').toLowerCase();
      const testid = DOM_TP_getAttr(el, 'data-testid').toLowerCase();
      const cls = DOM_TP_classSummary(el).toLowerCase();
      try {
        const r = el.getBoundingClientRect();
        if (r.top <= 140 && r.bottom <= 180) score += 8;
        if (r.width >= Math.max(320, W.innerWidth * 0.32)) score += 3;
        if (r.height > 0 && r.height <= 112) score += 2;
      } catch {}
      if (tag === 'header') score += 6;
      if (testid.includes('conversation') || testid.includes('chat') || testid.includes('thread')) score += 6;
      if (cls.includes('sticky') || cls.includes('fixed') || cls.includes('top-0')) score += 2;

      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }

    return bestScore >= 8 ? best : null;
  }

  function DOM_TP_pickChatGptSidebar(stats = null) {
    let candidates = [];
    try { candidates = Array.from(D.querySelectorAll(SEL_CHATGPT_SIDEBAR)); } catch { candidates = []; }

    let best = null;
    let bestScore = -Infinity;
    for (const el of candidates) {
      if (!DOM_TP_isEl(el) || DOM_TP_isH2OOwned(el, stats) || !DOM_TP_isVisible(el)) continue;

      let score = 0;
      const tag = String(el.tagName || '').toLowerCase();
      const testid = DOM_TP_getAttr(el, 'data-testid').toLowerCase();
      const aria = DOM_TP_getAttr(el, 'aria-label').toLowerCase();
      if (testid === 'sidebar') score += 20;
      if (aria === 'sidebar') score += 22;
      if (aria === 'chat history') score += 16;
      if (tag === 'nav') score += 3;
      if (tag === 'aside') score += 2;
      try {
        const r = el.getBoundingClientRect();
        if (r.left <= 80) score += 4;
        if (r.width >= 160 && r.width <= Math.max(420, W.innerWidth * 0.45)) score += 3;
        if (r.height >= Math.max(240, W.innerHeight * 0.45)) score += 3;
      } catch {}

      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }

    return bestScore >= 18 ? best : null;
  }

  function DOM_TP_sidebarLabelText(el) {
    return String(el?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[›>]\s*$/u, '')
      .trim()
      .toLowerCase();
  }

  function DOM_TP_findSidebarFirstSectionBoundary(sidebar, stats = null) {
    if (!DOM_TP_isEl(sidebar)) return null;
    const sectionLabels = new Set(['folders', 'labels', 'categories', 'projects', 'recents']);
    let candidates = [];
    try {
      candidates = Array.from(sidebar.querySelectorAll('h1, h2, h3, h4, h5, h6, a, button, div, span, p, [role="heading"], [role="button"], [data-sidebar-item="true"], [aria-label]'));
    } catch {
      candidates = [];
    }

    for (const el of candidates) {
      if (!DOM_TP_isEl(el)) continue;
      const text = DOM_TP_sidebarLabelText(el);
      const aria = DOM_TP_getAttr(el, 'aria-label').replace(/\s+/g, ' ').trim().toLowerCase();
      if (sectionLabels.has(text) || sectionLabels.has(aria)) return el;
    }
    return null;
  }

  function DOM_TP_isBeforeDomNode(el, boundary) {
    if (!DOM_TP_isEl(el) || !DOM_TP_isEl(boundary) || el === boundary) return false;
    try {
      const nodeApi = W.Node || (typeof Node !== 'undefined' ? Node : null);
      const follows = Number(nodeApi?.DOCUMENT_POSITION_FOLLOWING) || 4;
      return !!(el.compareDocumentPosition(boundary) & follows);
    } catch {
      return false;
    }
  }

  function DOM_TP_pickSidebarTopMoreRow(sidebar, stats = null) {
    if (!DOM_TP_isEl(sidebar)) return null;
    const firstSectionBoundary = DOM_TP_findSidebarFirstSectionBoundary(sidebar, stats);
    let candidates = [];
    try {
      candidates = Array.from(sidebar.querySelectorAll('a, button, [role="button"], [data-sidebar-item="true"]'));
    } catch {
      candidates = [];
    }

    for (const el of candidates) {
      if (!DOM_TP_isEl(el) || DOM_TP_isH2OOwned(el, stats) || !DOM_TP_isVisible(el)) continue;
      if (firstSectionBoundary && !DOM_TP_isBeforeDomNode(el, firstSectionBoundary)) continue;

      const text = DOM_TP_sidebarLabelText(el);
      const aria = DOM_TP_getAttr(el, 'aria-label').replace(/\s+/g, ' ').trim().toLowerCase();
      if (text !== 'more' && aria !== 'more') continue;
      return el;
    }

    return null;
  }

  function DOM_TP_pickChatGptFooter(composer = null, chatRoot = null, stats = null) {
    let candidates = [];
    try { candidates = Array.from(D.querySelectorAll(SEL_CHATGPT_FOOTER)); } catch { candidates = []; }

    const composerHost = DOM_TP_isEl(composer) ? composer : null;
    let best = null;
    let bestScore = -Infinity;
    for (const el of candidates) {
      if (!DOM_TP_isEl(el) || DOM_TP_isH2OOwned(el, stats) || !DOM_TP_isVisible(el)) continue;

      let score = 0;
      const tag = String(el.tagName || '').toLowerCase();
      const testid = DOM_TP_getAttr(el, 'data-testid').toLowerCase();
      const text = String(el.textContent || '').toLowerCase();
      if (testid === 'conversation-input-footer') score += 14;
      if (testid.includes('footer') || testid.includes('composer')) score += 6;
      if (tag === 'footer') score += 3;
      if (text.includes('chatgpt') || text.includes('mistakes')) score += 4;
      if (composerHost && (composerHost.contains?.(el) || el.contains?.(composerHost) || composerHost.parentElement?.contains?.(el))) score += 4;
      if (chatRoot && chatRoot.contains?.(el)) score += 2;
      try {
        const r = el.getBoundingClientRect();
        if (r.top >= W.innerHeight * 0.45) score += 2;
      } catch {}

      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }

    return bestScore >= 8 ? best : null;
  }

  function DOM_TP_countTargetMarks(stats = null) {
    const count = (sel) => {
      try { return D.querySelectorAll(sel).length; } catch { return 0; }
    };
    const cgxuiSamples = (sel) => {
      let nodes = [];
      try { nodes = Array.from(D.querySelectorAll(sel)); } catch { nodes = []; }
      return nodes.slice(0, 8).map((node) => ({
        tag: String(node?.tagName || '').toLowerCase(),
        testid: DOM_TP_getAttr(node, 'data-testid'),
        owner: DOM_TP_getAttr(node, ATTR_CGXUI_OWNER),
        cgxui: DOM_TP_getAttr(node, ATTR_CGXUI),
        className: DOM_TP_classSummary(node),
        h2oOwned: DOM_TP_isH2OOwned(node),
      }));
    };
    const chatFontTargets = count(`[${ATTR_HO_MESSAGE_TEXT}="true"]`) + count(`[${ATTR_HO_COMPOSER_INPUT}="true"]`);
    const pageFontTargets = count([
      `[${ATTR_HO_CHAT_ROOT}="true"]`,
      `[${ATTR_HO_CHAT_COLUMN}="true"]`,
      `[${ATTR_HO_COMPOSER}="true"]`,
      `[${ATTR_HO_CHATGPT_HEADER}="true"]`,
      `[${ATTR_HO_CHATGPT_SIDEBAR}="true"]`,
    ].join(','));
    const sidebarTargets = count(`[${ATTR_HO_CHATGPT_SIDEBAR}="true"]`);
    return {
      messages: count('[data-message-author-role]'),
      messageText: count(`[${ATTR_HO_MESSAGE_TEXT}="true"]`),
      composer: count(`[${ATTR_HO_COMPOSER}="true"]`),
      composerInput: count(`[${ATTR_HO_COMPOSER_INPUT}="true"]`),
      chatRoot: count(`[${ATTR_HO_CHAT_ROOT}="true"]`),
      chatColumn: count(`[${ATTR_HO_CHAT_COLUMN}="true"]`),
      chatgptHeader: count(`[${ATTR_HO_CHATGPT_HEADER}="true"]`),
      chatgptSidebar: sidebarTargets,
      chatgptFooter: count(`[${ATTR_HO_CHATGPT_FOOTER}="true"]`),
      scrollButton: count(`[${ATTR_HO_SCROLL_BUTTON}="true"]`),
      sidebarTopMore: count(`[${ATTR_HO_SIDEBAR_TOP_MORE}="true"]`),
      fontScope: CORE_TP_normalizeFontScope(STATE.settings?.fontScope),
      chatFontTargets,
      pageFontTargets,
      sidebarTargets,
      cgxuiPageFontSamples: cgxuiSamples([
        `[${ATTR_HO_CHAT_ROOT}="true"][${ATTR_CGXUI}]`,
        `[${ATTR_HO_CHAT_COLUMN}="true"][${ATTR_CGXUI}]`,
        `[${ATTR_HO_COMPOSER}="true"][${ATTR_CGXUI}]`,
        `[${ATTR_HO_COMPOSER_INPUT}="true"][${ATTR_CGXUI}]`,
        `[${ATTR_HO_CHATGPT_HEADER}="true"][${ATTR_CGXUI}]`,
        `[${ATTR_HO_CHATGPT_SIDEBAR}="true"][${ATTR_CGXUI}]`,
        `[${ATTR_HO_MESSAGE_TEXT}="true"][${ATTR_CGXUI}]`,
      ].join(',')),
      skippedH2OOwned: Number(stats?.skippedH2OOwned || 0),
      skipSamples: Array.isArray(stats?.skipSamples) ? stats.skipSamples.slice(0, 8) : [],
    };
  }

  function DOM_TP_resolveChatTargets() {
    const stats = { skippedH2OOwned: 0, skipSamples: [] };
    DOM_TP_clearInvalidTargetMarks();

    let chatRoot = null;
    let messages = [];
    try { messages = Array.from(D.querySelectorAll(SEL_CHAT_MESSAGE)); } catch { messages = []; }

    for (const msg of messages) {
      if (!DOM_TP_isEl(msg)) continue;
      if (DOM_TP_isH2OOwned(msg, stats)) continue;
      if (!chatRoot) chatRoot = msg.closest?.('main') || null;

      let textTargets = [];
      try { textTargets = Array.from(msg.querySelectorAll(SEL_CHAT_MESSAGE_TEXT)); } catch { textTargets = []; }
      textTargets = textTargets.filter((el) => {
        if (!DOM_TP_isEl(el)) return false;
        if (DOM_TP_isH2OOwned(el, stats)) return false;
        return true;
      });

      if (textTargets.length) {
        for (const el of textTargets) DOM_TP_markOwned(el, ATTR_HO_MESSAGE_TEXT, stats);
      } else if (!msg.querySelector?.(SEL_H2O_OWNED_ROOT)) {
        DOM_TP_markOwned(msg, ATTR_HO_MESSAGE_TEXT, stats);
      }
    }

    let looseTextTargets = [];
    try { looseTextTargets = Array.from(D.querySelectorAll(SEL_CHAT_MESSAGE_TEXT)); } catch { looseTextTargets = []; }
    for (const el of looseTextTargets) {
      if (!DOM_TP_isEl(el) || el.getAttribute?.(ATTR_HO_MESSAGE_TEXT) === 'true') continue;
      if (DOM_TP_isH2OOwned(el, stats)) continue;
      const hostMsg = el.closest?.('[data-message-author-role]') || null;
      if (hostMsg && !DOM_TP_isH2OOwned(hostMsg, stats)) {
        DOM_TP_markOwned(el, ATTR_HO_MESSAGE_TEXT, stats);
        if (!chatRoot) chatRoot = hostMsg.closest?.('main') || null;
      }
    }

    const composer = DOM_TP_pickComposerForm(stats);
    const promptInput = D.getElementById?.('prompt-textarea') || null;
    const composerInput = (promptInput && !DOM_TP_isH2OOwned(promptInput, stats))
      ? promptInput
      : DOM_TP_pickComposerInput(composer, stats);
    if (composer) {
      DOM_TP_markOwned(composer, ATTR_HO_COMPOSER, stats);
      if (!chatRoot) chatRoot = composer.closest?.('main') || null;
    }
    if (composerInput) {
      DOM_TP_markOwned(composerInput, ATTR_HO_COMPOSER_INPUT, stats);
      const inputForm = composerInput.closest?.('form') || null;
      if (inputForm) DOM_TP_markOwned(inputForm, ATTR_HO_COMPOSER, stats);
      if (!chatRoot) chatRoot = composerInput.closest?.('main') || null;
    }
    if (chatRoot) DOM_TP_markOwned(chatRoot, ATTR_HO_CHAT_ROOT, stats);

    for (const column of DOM_TP_pickChatColumns(messages, chatRoot, stats)) {
      DOM_TP_markOwned(column, ATTR_HO_CHAT_COLUMN, stats);
    }

    const chatHeader = DOM_TP_pickChatGptHeader(stats);
    if (chatHeader) DOM_TP_markOwned(chatHeader, ATTR_HO_CHATGPT_HEADER, stats);

    const chatSidebar = DOM_TP_pickChatGptSidebar(stats);
    if (chatSidebar) {
      DOM_TP_markOwned(chatSidebar, ATTR_HO_CHATGPT_SIDEBAR, stats);
      try {
        for (const node of Array.from(D.querySelectorAll(`[${ATTR_HO_SIDEBAR_TOP_MORE}="true"]`))) {
          node.removeAttribute(ATTR_HO_SIDEBAR_TOP_MORE);
          node.removeAttribute(ATTR_HO_SIDEBAR_MORE_HIDDEN);
        }
      } catch {}
      const sidebarTopMore = DOM_TP_pickSidebarTopMoreRow(chatSidebar, stats);
      if (sidebarTopMore) {
        DOM_TP_markOwned(sidebarTopMore, ATTR_HO_SIDEBAR_TOP_MORE, stats);
        DOM_TP_wireSidebarMoreGuard();
      } else {
        DOM_TP_unwireSidebarMoreGuard();
      }
    } else {
      DOM_TP_unwireSidebarMoreGuard();
    }

    const chatFooter = DOM_TP_pickChatGptFooter(composer, chatRoot, stats);
    if (chatFooter) DOM_TP_markOwned(chatFooter, ATTR_HO_CHATGPT_FOOTER, stats);

    return DOM_TP_countTargetMarks(stats);
  }

  function DOM_TP_scheduleChatTargetResolve() {
    if (STATE.disposed) return;
    if (STATE.chatTargetTimer) return;
    STATE.chatTargetTimer = W.setTimeout(() => {
      STATE.chatTargetTimer = 0;
      try { DOM_TP_resolveChatTargets(); } catch {}
    }, 120);
  }

  function DOM_TP_deferChatTargetResolve() {
    DOM_TP_scheduleChatTargetResolve();
    [350, 900, 1800].forEach((delay) => {
      W.setTimeout(() => {
        if (!STATE.disposed) DOM_TP_scheduleChatTargetResolve();
      }, delay);
    });
  }

  function API_TP_debugResolveTargets() {
    try { return DOM_TP_resolveChatTargets(); } catch { return DOM_TP_countTargetMarks(); }
  }

  function DOM_TP_clearChatTargetMarks() {
    if (STATE.chatTargetTimer) W.clearTimeout(STATE.chatTargetTimer);
    STATE.chatTargetTimer = 0;

    const attrs = [
      ATTR_HO_CHAT_ROOT,
      ATTR_HO_CHAT_COLUMN,
      ATTR_HO_MESSAGE_TEXT,
      ATTR_HO_COMPOSER,
      ATTR_HO_COMPOSER_INPUT,
      ATTR_HO_CHATGPT_HEADER,
      ATTR_HO_CHATGPT_SIDEBAR,
      ATTR_HO_CHATGPT_FOOTER,
      ATTR_HO_SCROLL_BUTTON,
    ];
    for (const attr of attrs) {
      let nodes = [];
      try { nodes = Array.from(D.querySelectorAll(`[${attr}="true"]`)); } catch { nodes = []; }
      for (const node of nodes) {
        try { node.removeAttribute(attr); } catch {}
      }
    }
  }

  function DOM_TP_ensureStyle() {
    const existing = D.getElementById(CSS_TPANEL_STYLE_ID);
    const cssText = CSS_TP_text();

    if (existing) {
      if (existing.textContent !== cssText) existing.textContent = cssText;
      return;
    }

    const s = D.createElement('style');
    s.id = CSS_TPANEL_STYLE_ID;
    s.setAttribute(ATTR_CGXUI, UI_TPANEL_STYLE);
    s.setAttribute(ATTR_CGXUI_OWNER, SkID);
    s.textContent = cssText;
    D.head.appendChild(s);
  }

  function DOM_TP_scheduleHydrationSafeHtmlMutation(fn) {
    if (typeof fn !== 'function') return;
    STATE.pendingHtmlMutation = fn;
    if (STATE.htmlMutationScheduled) return;
    STATE.htmlMutationScheduled = true;

    const run = () => {
      const latest = STATE.pendingHtmlMutation;
      STATE.pendingHtmlMutation = null;
      STATE.htmlMutationScheduled = false;
      if (!latest) return;
      try { latest(); } catch (err) { UTIL_recordDiagError(err); }
    };

    const afterReady = () => {
      const raf = typeof W.requestAnimationFrame === 'function'
        ? W.requestAnimationFrame.bind(W)
        : (cb) => W.setTimeout(cb, 16);
      raf(() => raf(run));
    };

    if (D.readyState === 'loading') {
      W.addEventListener(EV_DOM_READY, afterReady, { once: true });
    } else {
      afterReady();
    }
  }

  function DOM_TP_applySettings() {
    DOM_TP_ensureStyle();
    const S = STATE.settings;

    if (!S.enabled) {
      D.body.removeAttribute(ATTR_HO_THEME_ENABLED);
      DOM_TP_scheduleHydrationSafeHtmlMutation(() => {
        const root = D.documentElement;
        if (!root) return;
        root.removeAttribute(ATTR_HO_MODE);

        const el = root.style;
        el.removeProperty('--ho-accent-light-hsl');
        el.removeProperty('--ho-accent-dark-hsl');
        el.removeProperty('--ho-font-family');
        el.removeProperty('--ho-font-size');
        el.removeProperty('--ho-line-height');
        el.removeProperty('--ho-letter-space');
        el.removeProperty('--ho-chat-width-rem');
        el.removeProperty('--ho-prompt-width-rem');
        el.removeProperty('--main-surface-primary');
        el.removeProperty('--sidebar-surface-primary');
        el.removeProperty('--sidebar-surface-secondary');
        el.removeProperty('--sidebar-surface-tertiary');
        el.removeProperty('--bg-primary');
        el.removeProperty('--bg-secondary');
        el.removeProperty('--text-primary');
        el.removeProperty('--text-secondary');
        el.removeProperty('--text-tertiary');
        el.removeProperty('--interactive-bg-secondary-hover');
        el.removeProperty('--interactive-bg-secondary-press');
      });

      D.body.removeAttribute(ATTR_HO_FONT);
      D.body.removeAttribute(ATTR_HO_FONT_SCOPE);
      D.body.removeAttribute(ATTR_HO_FONT_TUNED);
      D.body.removeAttribute(ATTR_HO_LAYOUT_TUNED);
      DOM_TP_deferChatTargetResolve();
      return;
    }

    D.body.setAttribute(ATTR_HO_THEME_ENABLED, 'true');

    let fontFlag = CORE_TP_normalizeFontFamily(S.fontFamily);
    const fontScope = CORE_TP_normalizeFontScope(S.fontScope);
    S.fontFamily = fontFlag;
    S.fontScope = fontScope;
    D.body.setAttribute(ATTR_HO_FONT, fontFlag);
    D.body.setAttribute(ATTR_HO_FONT_SCOPE, fontScope);
    const fontTuned = (
      fontFlag !== DEFAULT_SETTINGS.fontFamily ||
      Number(S.fontSize) !== DEFAULT_SETTINGS.fontSize ||
      Number(S.lineHeight) !== DEFAULT_SETTINGS.lineHeight ||
      Number(S.letterSpace) !== DEFAULT_SETTINGS.letterSpace
    );
    const layoutTuned = (
      Number(S.chatWidth) !== DEFAULT_SETTINGS.chatWidth ||
      Number(S.promptWidth) !== DEFAULT_SETTINGS.promptWidth ||
      Boolean(S.chatFullWidth) !== DEFAULT_SETTINGS.chatFullWidth ||
      Boolean(S.syncPromptWidth) !== DEFAULT_SETTINGS.syncPromptWidth
    );
    D.body.setAttribute(ATTR_HO_FONT_TUNED, String(fontTuned));
    D.body.setAttribute(ATTR_HO_LAYOUT_TUNED, String(layoutTuned));

    const htmlMode = S.mode;
    const accentLight = S.accentLight;
    const accentDark = S.accentDark;
    const fontSize = S.fontSize;
    const lineHeight = S.lineHeight;
    const letterSpace = S.letterSpace;
    const chatWidth = S.chatWidth;
    const promptWidth = S.promptWidth;
    const fontFamily = FONT_STACKS[fontFlag] || FONT_STACKS.system;
    DOM_TP_scheduleHydrationSafeHtmlMutation(() => {
      const root = D.documentElement;
      if (!root) return;
      root.setAttribute(ATTR_HO_MODE, htmlMode);

      const el = root.style;
      el.setProperty('--ho-accent-light-hsl', accentLight);
      el.setProperty('--ho-accent-dark-hsl', accentDark);
      el.setProperty('--ho-font-family', fontFamily);
      el.setProperty('--ho-font-size', `${fontSize}px`);
      el.setProperty('--ho-line-height', `${lineHeight}px`);
      el.setProperty('--ho-letter-space', `${letterSpace}px`);
      el.setProperty('--ho-chat-width-rem', `${chatWidth}rem`);
      el.setProperty('--ho-prompt-width-rem', `${promptWidth}rem`);
      el.setProperty('--main-surface-primary', 'var(--ho-theme-surface-strong)');
      el.setProperty('--sidebar-surface-primary', 'var(--ho-theme-sidebar-solid)');
      el.setProperty('--sidebar-surface-secondary', 'var(--ho-theme-sidebar-solid)');
      el.setProperty('--sidebar-surface-tertiary', 'var(--ho-theme-sidebar-solid)');
      el.setProperty('--bg-primary', 'var(--ho-theme-canvas)');
      el.setProperty('--bg-secondary', 'var(--ho-theme-surface)');
      el.setProperty('--text-primary', 'var(--ho-theme-text)');
      el.setProperty('--text-secondary', 'var(--ho-theme-text-muted)');
      el.setProperty('--text-tertiary', 'color-mix(in srgb, var(--ho-theme-text-muted) 78%, transparent)');
      el.setProperty('--interactive-bg-secondary-hover', 'color-mix(in srgb, var(--ho-theme-surface-strong) 78%, white 22%)');
      el.setProperty('--interactive-bg-secondary-press', 'color-mix(in srgb, var(--ho-theme-surface-strong) 70%, var(--ho-accent-light) 30%)');
    });

    D.body.setAttribute(ATTR_HO_CHAT_FULL, String(S.chatFullWidth));
    D.body.setAttribute(ATTR_HO_SYNC_PROMPT, String(S.syncPromptWidth));
    D.body.setAttribute(ATTR_HO_HIDE_HEADER, String(S.hideHeader));
    D.body.setAttribute(ATTR_HO_HIDE_FOOTER, String(S.hideFooter));
    D.body.setAttribute(ATTR_HO_EXPAND_CHATBOX, String(S.expandChatbox));
    D.body.setAttribute(ATTR_HO_SCROLL_ALIGN, S.scrollAlign);
    DOM_TP_deferChatTargetResolve();
  }

  /* ───────────────────────────── 🟪 UI BOUNDARY — CSS RULES 📄🔓💧 ───────────────────────────── */

  function CSS_TP_text() {
    const BACKDROP = DOM_selScoped(UI_TPANEL_BACKDROP);
    const PANEL    = DOM_selScoped(UI_TPANEL_PANEL);
    const TINYBTN  = DOM_selScoped(UI_TPANEL_TINY_RAIL);

    const TABBTN   = DOM_selScoped(UI_TPANEL_TABBTN);
    const PANE     = DOM_selScoped(UI_TPANEL_PANE);
    const RESET    = DOM_selScoped(UI_TPANEL_RESET);
    const ENABLE   = DOM_selScoped(UI_TPANEL_ENABLE);
    const CLOSE    = DOM_selScoped(UI_TPANEL_CLOSE);

    // Scoped “class-like” attributes inside owned subtree (avoid global .active etc.)
    const STATE_ACTIVE = 'active'; // used only as data-cgxui-state value

    return `
:root {
  --ho-accent-light-hsl: ${STATE.settings?.accentLight ?? DEFAULT_SETTINGS.accentLight};
  --ho-accent-dark-hsl:  ${STATE.settings?.accentDark  ?? DEFAULT_SETTINGS.accentDark};
  --ho-accent-light: hsl(var(--ho-accent-light-hsl));
  --ho-accent-dark:  hsl(var(--ho-accent-dark-hsl));
  --ho-font-size: ${STATE.settings?.fontSize ?? DEFAULT_SETTINGS.fontSize}px;
  --ho-line-height: ${STATE.settings?.lineHeight ?? DEFAULT_SETTINGS.lineHeight}px;
  --ho-letter-space: ${STATE.settings?.letterSpace ?? DEFAULT_SETTINGS.letterSpace}px;
  --ho-chat-width-rem: ${STATE.settings?.chatWidth ?? DEFAULT_SETTINGS.chatWidth}rem;
  --ho-prompt-width-rem: ${STATE.settings?.promptWidth ?? DEFAULT_SETTINGS.promptWidth}rem;
}

/* global theme tokens */
:root {
  --ho-theme-canvas: #020617;
  --ho-theme-canvas-top: #0f172a;
  --ho-theme-shell: rgba(15,23,42,0.82);
  --ho-theme-surface: rgba(15,23,42,0.72);
  --ho-theme-surface-strong: rgba(15,23,42,0.88);
  --ho-theme-sidebar-solid: #0f172a;
  --ho-theme-topbar-solid: #0f172a;
  --ho-theme-border: rgba(148,163,184,0.24);
  --ho-theme-text: rgba(226,232,240,0.96);
  --ho-theme-text-muted: rgba(203,213,225,0.78);
}

html[${ATTR_HO_MODE}="light"]{
  color-scheme: light;
  --ho-theme-canvas: color-mix(in srgb, #fffaf0 86%, var(--ho-accent-light) 14%);
  --ho-theme-canvas-top: color-mix(in srgb, #eef2ff 78%, var(--ho-accent-light) 22%);
  --ho-theme-shell: color-mix(in srgb, rgba(255,255,255,0.96) 90%, var(--ho-accent-light) 10%);
  --ho-theme-surface: color-mix(in srgb, rgba(255,255,255,0.92) 82%, var(--ho-accent-light) 18%);
  --ho-theme-surface-strong: color-mix(in srgb, rgba(248,250,252,0.98) 78%, var(--ho-accent-light) 22%);
  --ho-theme-sidebar-solid: color-mix(in srgb, #fffaf0 82%, var(--ho-accent-light) 18%);
  --ho-theme-topbar-solid: color-mix(in srgb, #f8fafc 82%, var(--ho-accent-light) 18%);
  --ho-theme-border: color-mix(in srgb, rgba(148,163,184,0.42) 68%, var(--ho-accent-dark) 32%);
  --ho-theme-text: #172033;
  --ho-theme-text-muted: #475569;
}
html[${ATTR_HO_MODE}="dark"]{
  color-scheme: dark;
  --ho-theme-canvas: color-mix(in srgb, #020617 82%, var(--ho-accent-dark) 18%);
  --ho-theme-canvas-top: color-mix(in srgb, #0f172a 72%, var(--ho-accent-dark) 28%);
  --ho-theme-shell: color-mix(in srgb, rgba(15,23,42,0.92) 82%, var(--ho-accent-dark) 18%);
  --ho-theme-surface: color-mix(in srgb, rgba(15,23,42,0.84) 78%, var(--ho-accent-light) 22%);
  --ho-theme-surface-strong: color-mix(in srgb, rgba(15,23,42,0.96) 72%, var(--ho-accent-dark) 28%);
  --ho-theme-sidebar-solid: color-mix(in srgb, #0f172a 74%, var(--ho-accent-dark) 26%);
  --ho-theme-topbar-solid: color-mix(in srgb, #111827 78%, var(--ho-accent-dark) 22%);
  --ho-theme-border: color-mix(in srgb, rgba(148,163,184,0.22) 58%, var(--ho-accent-light) 42%);
  --ho-theme-text: rgba(226,232,240,0.96);
  --ho-theme-text-muted: rgba(203,213,225,0.78);
}
html[${ATTR_HO_MODE}="system"]{
  color-scheme: light dark;
}
html[${ATTR_HO_MODE}]{
  background: var(--ho-theme-canvas) !important;
  color: var(--ho-theme-text);
}
@media (prefers-color-scheme: light) {
  html[${ATTR_HO_MODE}="system"]{
    --ho-theme-canvas: color-mix(in srgb, #fffaf0 86%, var(--ho-accent-light) 14%);
    --ho-theme-canvas-top: color-mix(in srgb, #eef2ff 78%, var(--ho-accent-light) 22%);
    --ho-theme-shell: color-mix(in srgb, rgba(255,255,255,0.96) 90%, var(--ho-accent-light) 10%);
    --ho-theme-surface: color-mix(in srgb, rgba(255,255,255,0.92) 82%, var(--ho-accent-light) 18%);
    --ho-theme-surface-strong: color-mix(in srgb, rgba(248,250,252,0.98) 78%, var(--ho-accent-light) 22%);
    --ho-theme-sidebar-solid: color-mix(in srgb, #fffaf0 82%, var(--ho-accent-light) 18%);
    --ho-theme-topbar-solid: color-mix(in srgb, #f8fafc 82%, var(--ho-accent-light) 18%);
    --ho-theme-border: color-mix(in srgb, rgba(148,163,184,0.42) 68%, var(--ho-accent-dark) 32%);
    --ho-theme-text: #172033;
    --ho-theme-text-muted: #475569;
  }
}
@media (prefers-color-scheme: dark) {
  html[${ATTR_HO_MODE}="system"]{
    --ho-theme-canvas: color-mix(in srgb, #020617 82%, var(--ho-accent-dark) 18%);
    --ho-theme-canvas-top: color-mix(in srgb, #0f172a 72%, var(--ho-accent-dark) 28%);
    --ho-theme-shell: color-mix(in srgb, rgba(15,23,42,0.92) 82%, var(--ho-accent-dark) 18%);
    --ho-theme-surface: color-mix(in srgb, rgba(15,23,42,0.84) 78%, var(--ho-accent-light) 22%);
    --ho-theme-surface-strong: color-mix(in srgb, rgba(15,23,42,0.96) 72%, var(--ho-accent-dark) 28%);
    --ho-theme-sidebar-solid: color-mix(in srgb, #0f172a 74%, var(--ho-accent-dark) 26%);
    --ho-theme-topbar-solid: color-mix(in srgb, #111827 78%, var(--ho-accent-dark) 22%);
    --ho-theme-border: color-mix(in srgb, rgba(148,163,184,0.22) 58%, var(--ho-accent-light) 42%);
    --ho-theme-text: rgba(226,232,240,0.96);
    --ho-theme-text-muted: rgba(203,213,225,0.78);
  }
}

/* whole-page theme background */
body[${ATTR_HO_THEME_ENABLED}="true"] {
  background:
    radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--ho-accent-light) 32%, transparent), transparent 34%),
    radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--ho-accent-dark) 28%, transparent), transparent 38%),
    linear-gradient(180deg, var(--ho-theme-canvas-top), var(--ho-theme-canvas)) fixed !important;
  color: var(--ho-theme-text);
}
body[${ATTR_HO_THEME_ENABLED}="true"],
body[${ATTR_HO_THEME_ENABLED}="true"] #__next,
body[${ATTR_HO_THEME_ENABLED}="true"] #__next > div,
body[${ATTR_HO_THEME_ENABLED}="true"] main {
  background-color: transparent !important;
  color: inherit;
}
body[${ATTR_HO_THEME_ENABLED}="true"] [role="dialog"],
body[${ATTR_HO_THEME_ENABLED}="true"] [role="menu"],
body[${ATTR_HO_THEME_ENABLED}="true"] [role="listbox"],
body[${ATTR_HO_THEME_ENABLED}="true"] [data-radix-popper-content-wrapper] {
  background: var(--ho-theme-surface-strong) !important;
  border-color: var(--ho-theme-border) !important;
  color: var(--ho-theme-text) !important;
}

/* page shell colors only; do not frame individual answers/questions */
body[${ATTR_HO_THEME_ENABLED}="true"] header,
body[${ATTR_HO_THEME_ENABLED}="true"] aside,
body[${ATTR_HO_THEME_ENABLED}="true"] [data-testid="sidebar"],
body[${ATTR_HO_THEME_ENABLED}="true"] [class*="composer-parent"],
body[${ATTR_HO_THEME_ENABLED}="true"] [data-testid="conversation-input-footer"] {
  background: var(--ho-theme-surface) !important;
  border-color: var(--ho-theme-border) !important;
  color: var(--ho-theme-text);
}
body[${ATTR_HO_THEME_ENABLED}="true"] [class*="composer-parent"]:has([${ATTR_HO_COMPOSER}="true"]),
body[${ATTR_HO_THEME_ENABLED}="true"] [class*="composer-parent"]:has([${ATTR_HO_COMPOSER_INPUT}="true"]) {
  background:
    linear-gradient(180deg, var(--ho-theme-canvas-top) 0%, var(--ho-theme-canvas) 42%, var(--ho-theme-canvas) 100%) !important;
  border-color: color-mix(in srgb, var(--ho-theme-border) 82%, transparent) !important;
  border-radius: 30px 30px 0 0;
  background-clip: padding-box;
  box-shadow:
    0 -28px 54px 18px var(--ho-theme-canvas),
    inset 0 1px 0 color-mix(in srgb, var(--ho-theme-border) 62%, transparent);
  isolation: isolate;
}
body[${ATTR_HO_THEME_ENABLED}="true"] aside,
body[${ATTR_HO_THEME_ENABLED}="true"] nav[aria-label*="chat" i],
body[${ATTR_HO_THEME_ENABLED}="true"] [data-testid="sidebar"],
body[${ATTR_HO_THEME_ENABLED}="true"] #stage-sidebar-tiny-bar {
  background: var(--ho-theme-sidebar-solid) !important;
  background-image: none !important;
  color: var(--ho-theme-text) !important;
}
body[${ATTR_HO_THEME_ENABLED}="true"] aside :is(div, nav, section, ul, li, a, button),
body[${ATTR_HO_THEME_ENABLED}="true"] nav[aria-label*="chat" i] :is(div, section, ul, li, a, button),
body[${ATTR_HO_THEME_ENABLED}="true"] [data-testid="sidebar"] :is(div, nav, section, ul, li, a, button) {
  background: transparent !important;
  background-image: none !important;
  border-color: transparent !important;
  box-shadow: none !important;
}
body[${ATTR_HO_THEME_ENABLED}="true"] aside :is(div, nav, section, ul, li, a, button)::before,
body[${ATTR_HO_THEME_ENABLED}="true"] aside :is(div, nav, section, ul, li, a, button)::after,
body[${ATTR_HO_THEME_ENABLED}="true"] nav[aria-label*="chat" i] :is(div, section, ul, li, a, button)::before,
body[${ATTR_HO_THEME_ENABLED}="true"] nav[aria-label*="chat" i] :is(div, section, ul, li, a, button)::after,
body[${ATTR_HO_THEME_ENABLED}="true"] [data-testid="sidebar"] :is(div, nav, section, ul, li, a, button)::before,
body[${ATTR_HO_THEME_ENABLED}="true"] [data-testid="sidebar"] :is(div, nav, section, ul, li, a, button)::after {
  background: transparent !important;
  background-image: none !important;
  border-color: transparent !important;
  box-shadow: none !important;
}
body[${ATTR_HO_THEME_ENABLED}="true"] aside :is([class*="sticky"], [class*="fixed"], [style*="position: sticky"], [style*="position: fixed"]),
body[${ATTR_HO_THEME_ENABLED}="true"] nav[aria-label*="chat" i] :is([class*="sticky"], [class*="fixed"], [style*="position: sticky"], [style*="position: fixed"]),
body[${ATTR_HO_THEME_ENABLED}="true"] [data-testid="sidebar"] :is([class*="sticky"], [class*="fixed"], [style*="position: sticky"], [style*="position: fixed"]) {
  background: var(--ho-theme-sidebar-solid) !important;
  background-image: none !important;
  color: var(--ho-theme-text) !important;
  z-index: 40 !important;
  isolation: isolate;
}
body[${ATTR_HO_THEME_ENABLED}="true"] aside :is([class*="sticky"], [class*="fixed"], [style*="position: sticky"], [style*="position: fixed"])::before,
body[${ATTR_HO_THEME_ENABLED}="true"] nav[aria-label*="chat" i] :is([class*="sticky"], [class*="fixed"], [style*="position: sticky"], [style*="position: fixed"])::before,
body[${ATTR_HO_THEME_ENABLED}="true"] [data-testid="sidebar"] :is([class*="sticky"], [class*="fixed"], [style*="position: sticky"], [style*="position: fixed"])::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: var(--ho-theme-sidebar-solid) !important;
  background-image: none !important;
}
body[${ATTR_HO_THEME_ENABLED}="true"] [${ATTR_HO_CHATGPT_SIDEBAR}="true"] nav[aria-label="Chat history"] {
  position: relative;
  z-index: 0;
}
body[${ATTR_HO_THEME_ENABLED}="true"] [${ATTR_HO_CHATGPT_SIDEBAR}="true"] :is(div, section, nav):has(> nav[aria-label="Chat history"]) > :not(nav[aria-label="Chat history"]),
body[${ATTR_HO_THEME_ENABLED}="true"] [${ATTR_HO_CHATGPT_SIDEBAR}="true"] :is(div, section, nav):has(+ nav[aria-label="Chat history"]),
body[${ATTR_HO_THEME_ENABLED}="true"] [${ATTR_HO_CHATGPT_SIDEBAR}="true"] :is(div, section, nav):has(~ nav[aria-label="Chat history"]),
body[${ATTR_HO_THEME_ENABLED}="true"] [${ATTR_HO_CHATGPT_SIDEBAR}="true"] :is([class*="sticky"], [class*="fixed"], [class*="top-0"], [style*="position: sticky"], [style*="position: fixed"]) {
  position: relative;
  z-index: 45;
  background: var(--ho-theme-sidebar-solid) !important;
  background-image: none !important;
  isolation: isolate;
}
body[${ATTR_HO_THEME_ENABLED}="true"] [${ATTR_HO_CHATGPT_SIDEBAR}="true"] :is(div, section, nav):has(> nav[aria-label="Chat history"]) > :not(nav[aria-label="Chat history"])::before,
body[${ATTR_HO_THEME_ENABLED}="true"] [${ATTR_HO_CHATGPT_SIDEBAR}="true"] :is(div, section, nav):has(+ nav[aria-label="Chat history"])::before,
body[${ATTR_HO_THEME_ENABLED}="true"] [${ATTR_HO_CHATGPT_SIDEBAR}="true"] :is(div, section, nav):has(~ nav[aria-label="Chat history"])::before,
body[${ATTR_HO_THEME_ENABLED}="true"] [${ATTR_HO_CHATGPT_SIDEBAR}="true"] :is([class*="sticky"], [class*="fixed"], [class*="top-0"], [style*="position: sticky"], [style*="position: fixed"])::before {
  content: "";
  position: absolute;
  inset: -6px 0 -10px;
  z-index: -1;
  background: var(--ho-theme-sidebar-solid) !important;
  background-image: none !important;
  pointer-events: none;
}
body[${ATTR_HO_THEME_ENABLED}="true"] [${ATTR_HO_SIDEBAR_TOP_MORE}="true"] {
  background: var(--ho-theme-sidebar-solid) !important;
  background-image: none !important;
}
body[${ATTR_HO_THEME_ENABLED}="true"] [${ATTR_HO_SIDEBAR_TOP_MORE}="true"][${ATTR_HO_SIDEBAR_MORE_HIDDEN}="true"] {
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none;
}
body[${ATTR_HO_THEME_ENABLED}="true"] main > div:first-child,
body[${ATTR_HO_THEME_ENABLED}="true"] main > div:first-child > div:first-child {
  background: transparent !important;
  border-top-left-radius: 0 !important;
  border-top-right-radius: 0 !important;
}
body[${ATTR_HO_THEME_ENABLED}="true"] main,
body[${ATTR_HO_THEME_ENABLED}="true"] [${ATTR_HO_CHAT_ROOT}="true"] {
  border-top-left-radius: 0 !important;
  border-top-right-radius: 0 !important;
}

/* FONT (family choice) */
body[${ATTR_HO_FONT_TUNED}="true"] [${ATTR_HO_MESSAGE_TEXT}="true"],
body[${ATTR_HO_FONT_TUNED}="true"] [${ATTR_HO_COMPOSER_INPUT}="true"] {
  font-family: var(--ho-font-family);
  font-size: var(--ho-font-size);
  line-height: var(--ho-line-height);
  letter-spacing: var(--ho-letter-space);
}
body[${ATTR_HO_FONT_TUNED}="true"][${ATTR_HO_FONT_SCOPE}="page"] [${ATTR_HO_CHAT_ROOT}="true"],
body[${ATTR_HO_FONT_TUNED}="true"][${ATTR_HO_FONT_SCOPE}="page"] [${ATTR_HO_CHAT_COLUMN}="true"],
body[${ATTR_HO_FONT_TUNED}="true"][${ATTR_HO_FONT_SCOPE}="page"] [${ATTR_HO_COMPOSER}="true"],
body[${ATTR_HO_FONT_TUNED}="true"][${ATTR_HO_FONT_SCOPE}="page"] [${ATTR_HO_COMPOSER_INPUT}="true"],
body[${ATTR_HO_FONT_TUNED}="true"][${ATTR_HO_FONT_SCOPE}="page"] [${ATTR_HO_CHATGPT_HEADER}="true"],
body[${ATTR_HO_FONT_TUNED}="true"][${ATTR_HO_FONT_SCOPE}="page"] [${ATTR_HO_CHATGPT_SIDEBAR}="true"] {
  font-family: var(--ho-font-family);
}
body[${ATTR_HO_FONT_TUNED}="true"][${ATTR_HO_FONT_SCOPE}="page"] [${ATTR_HO_CHATGPT_SIDEBAR}="true"] :where(*) {
  font-family: var(--ho-font-family);
}
body[${ATTR_HO_FONT_TUNED}="true"][${ATTR_HO_FONT_SCOPE}="page"] [${ATTR_HO_CHATGPT_SIDEBAR}="true"] :is(${SEL_H2O_OWNED_ROOT}),
body[${ATTR_HO_FONT_TUNED}="true"][${ATTR_HO_FONT_SCOPE}="page"] [${ATTR_HO_CHATGPT_SIDEBAR}="true"] :is(${SEL_H2O_OWNED_ROOT}) * {
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

/* ACCENT: send button + toggles */
${SEL_SEND_BTN} {
  background: var(--ho-accent-dark);
  border-color: var(--ho-accent-dark);
  color: #020617;
}
${SEL_SEND_BTN}:hover {
  filter: brightness(1.05);
}

/* layout: ChatGPT-native chat width */
body[${ATTR_HO_THEME_ENABLED}="true"][${ATTR_HO_LAYOUT_TUNED}="true"] [${ATTR_HO_CHAT_COLUMN}="true"] {
  max-width: min(100%, var(--ho-chat-width-rem));
  width: min(100%, var(--ho-chat-width-rem));
  margin-inline: auto;
}
body[${ATTR_HO_THEME_ENABLED}="true"][${ATTR_HO_LAYOUT_TUNED}="true"][${ATTR_HO_CHAT_FULL}="true"] [${ATTR_HO_CHAT_ROOT}="true"],
body[${ATTR_HO_THEME_ENABLED}="true"][${ATTR_HO_LAYOUT_TUNED}="true"][${ATTR_HO_CHAT_FULL}="true"] [${ATTR_HO_CHAT_COLUMN}="true"] {
  max-width: 100%;
  width: 100%;
}

/* layout: ChatGPT-native prompt width */
body[${ATTR_HO_THEME_ENABLED}="true"] [${ATTR_HO_COMPOSER}="true"] {
  background: color-mix(in srgb, var(--ho-theme-canvas) 82%, var(--ho-theme-surface-strong) 18%) !important;
  border-color: color-mix(in srgb, var(--ho-theme-border) 82%, transparent) !important;
  border-radius: 32px !important;
  background-clip: padding-box;
  box-shadow:
    0 18px 44px color-mix(in srgb, var(--ho-theme-canvas) 56%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--ho-theme-border) 48%, transparent);
  color: var(--ho-theme-text);
}
body[${ATTR_HO_THEME_ENABLED}="true"][${ATTR_HO_LAYOUT_TUNED}="true"] [${ATTR_HO_COMPOSER}="true"] {
  max-width: min(100%, var(--ho-prompt-width-rem));
  width: min(100%, var(--ho-prompt-width-rem));
  margin-inline: auto;
}
body[${ATTR_HO_THEME_ENABLED}="true"][${ATTR_HO_LAYOUT_TUNED}="true"][${ATTR_HO_SYNC_PROMPT}="true"] [${ATTR_HO_COMPOSER}="true"] {
  max-width: min(100%, var(--ho-chat-width-rem));
  width: min(100%, var(--ho-chat-width-rem));
}

body[${ATTR_HO_THEME_ENABLED}="true"] [${ATTR_HO_COMPOSER_INPUT}="true"] {
  color: var(--ho-theme-text) !important;
}

/* layout: ChatGPT-native header/footer hiding */
body[${ATTR_HO_THEME_ENABLED}="true"][${ATTR_HO_HIDE_HEADER}="true"] [${ATTR_HO_CHATGPT_HEADER}="true"] {
  display: none;
}
body[${ATTR_HO_THEME_ENABLED}="true"][${ATTR_HO_HIDE_FOOTER}="true"] [${ATTR_HO_CHATGPT_FOOTER}="true"] {
  display: none;
}

/* layout: ChatGPT-native composer expansion */
body[${ATTR_HO_THEME_ENABLED}="true"][${ATTR_HO_EXPAND_CHATBOX}="true"] [${ATTR_HO_COMPOSER_INPUT}="true"] {
  min-height: 130px;
}

/* ChatGPT-native header/footer tint */
body[${ATTR_HO_THEME_ENABLED}="true"] [${ATTR_HO_CHATGPT_HEADER}="true"] {
  background: var(--ho-theme-topbar-solid) !important;
  background-image: none !important;
  backdrop-filter: none !important;
}
body[${ATTR_HO_THEME_ENABLED}="true"] [${ATTR_HO_CHATGPT_HEADER}="true"] [class*="sticky"][class*="top-0"] {
  background: var(--ho-theme-topbar-solid) !important;
  background-image: none !important;
  backdrop-filter: none !important;
}
body[${ATTR_HO_THEME_ENABLED}="true"] [${ATTR_HO_CHATGPT_FOOTER}="true"] {
  background: linear-gradient(180deg, var(--ho-theme-surface), var(--ho-theme-surface-strong)) !important;
}

/* ───────── panel backdrop/panel (cgxui-owned) ───────── */
${BACKDROP} {
  position: fixed;
  inset: 0;
  z-index: 999998;
  background: transparent;
  pointer-events: none;
}

${PANEL} {
  position: absolute;
  z-index: 999999;
  pointer-events: auto;
  width: ${CFG_PANEL_WIDTH_PX}px;
  max-width: calc(100vw - 2rem);
  max-height: calc(100vh - 8rem);
  border-radius: 28px;
  padding: 18px 20px 16px;
  background: radial-gradient(circle at top left, rgba(148,163,253,0.25), transparent 55%), rgba(15,23,42,0.96);
  border: 1px solid rgba(148,163,253,0.35);
  box-shadow:
    0 20px 55px rgba(0,0,0,0.7),
    0 0 0 1px rgba(15,23,42,0.9);
  color: #e5e7eb;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  backdrop-filter: blur(22px);

  font-size: 13px;
  line-height: 1.4;
  letter-spacing: 0;
}

${PANEL}[${ATTR_CGXUI_STATE}="light"] {
  background: radial-gradient(circle at top left, rgba(129,140,248,0.20), transparent 55%), rgba(248,250,252,0.98);
  color: #0f172a;
}

/* internal typography */
${PANEL} * {
  font-size: inherit;
  line-height: inherit;
  letter-spacing: inherit;
}

/* header area */
${PANEL} [data-part="hdr"] { text-align: center; margin-bottom: 12px; }
${PANEL} [data-part="ttl"] { font-weight: 600; font-size: 16px; }
${PANEL} [data-part="ttl"] span { font-weight: 700; }
${PANEL} [data-part="hdrrow"] {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  cursor: grab;
  user-select: none;
}
${PANEL} [data-part="hdrrow"][data-dragging="true"] { cursor: grabbing; }
${PANEL} [data-part="hdractions"] { display:flex; align-items:center; gap:8px; }

/* enable toggle (owned) */
${ENABLE} {
  border-radius: 999px;
  padding: 4px 10px;
  border: 1px solid rgba(148,163,253,0.7);
  background: rgba(15,23,42,0.9);
  color: inherit;
  font-size: 11px;
  cursor: pointer;
}
${ENABLE}[${ATTR_CGXUI_STATE}="off"] { opacity: 0.5; }

${CLOSE} {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: 1px solid rgba(148,163,253,0.45);
  background: rgba(15,23,42,0.82);
  color: inherit;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
${PANEL}[${ATTR_CGXUI_STATE}="light"] ${CLOSE} {
  background: rgba(226,232,240,0.92);
}

/* tabs (owned) */
${PANEL} [data-part="tabs"] {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  background: rgba(15,23,42,0.9);
  padding: 3px;
  border-radius: 999px;
}
${PANEL}[${ATTR_CGXUI_STATE}="light"] [data-part="tabs"] { background: rgba(226,232,240,0.9); }

${TABBTN} {
  flex: 1;
  border-radius: 999px;
  padding: 6px 8px;
  font-size: 12px;
  text-align: center;
  cursor: pointer;
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.75;
}
${TABBTN}[${ATTR_CGXUI_STATE}="${STATE_ACTIVE}"] {
  background: var(--ho-accent-dark);
  color: #020617;
  opacity: 1;
}

/* content/panes */
${PANEL} [data-part="content"] { flex:1; overflow:auto; padding-right:4px; }
${PANE} { display:none; }
${PANE}[${ATTR_CGXUI_STATE}="${STATE_ACTIVE}"] { display:block; }

/* card */
${PANEL} [data-part="card"]{
  border-radius: 20px;
  padding: 12px 12px 10px;
  background: radial-gradient(circle at top left, rgba(148,163,253,0.18), transparent 60%), rgba(15,23,42,0.85);
  border: 1px solid rgba(148,163,253,0.35);
  margin-bottom: 10px;
}
${PANEL}[${ATTR_CGXUI_STATE}="light"] [data-part="card"]{
  background: radial-gradient(circle at top left, rgba(129,140,248,0.18), transparent 60%), rgba(248,250,252,0.98);
}
${PANEL} [data-part="cardttl"]{ font-size:12px; font-weight:600; margin-bottom:4px; }
${PANEL} [data-part="lbl"]{ font-size:11px; font-weight:600; opacity:0.85; margin-bottom:2px; }

/* switch */
${PANEL} [data-part="swrow"]{ display:flex; align-items:center; justify-content:space-between; margin-top:6px; }
${PANEL} [data-part="swmeta"]{ display:flex; flex-direction:column; gap:1px; }
${PANEL} [data-part="swmeta"] span:first-child{ font-size:12px; font-weight:600; }
${PANEL} [data-part="swmeta"] span:last-child{ font-size:11px; opacity:0.75; }
${PANEL} [data-part="sw"]{
  position: relative;
  width: 40px;
  height: 20px;
  border-radius: 999px;
  background: rgba(15,23,42,0.7);
  border: 1px solid rgba(148,163,253,0.6);
  cursor: pointer;
  flex-shrink: 0;
}
${PANEL}[${ATTR_CGXUI_STATE}="light"] [data-part="sw"] { background: rgba(226,232,240,0.9); }
${PANEL} [data-part="sw"]::before{
  content:"";
  position:absolute; top:1px; left:1px;
  width:16px; height:16px; border-radius:999px;
  background:#e5e7eb;
  transition: transform 160ms ease;
}
${PANEL} [data-part="sw"][${ATTR_CGXUI_STATE}="on"] { background: var(--ho-accent-dark); }
${PANEL} [data-part="sw"][${ATTR_CGXUI_STATE}="on"]::before { transform: translateX(18px); }

/* font grid cards */
${PANEL} [data-part="fgrid"]{ display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:6px; }
${PANEL} [data-part="fcard"]{
  border-radius:16px; padding:8px; text-align:center; cursor:pointer;
  border:2px solid transparent;
}
${PANEL} [data-part="fcard"] span{ display:block; font-size:12px; }
${PANEL} [data-part="fcard"] [data-role="hint"]{ margin-top:3px; font-size:10px; line-height:1.2; opacity:.72; }
${PANEL} [data-part="fcard"][${ATTR_CGXUI_STATE}="on"]{ border-color: rgba(255,255,255,0.85); }

/* reset (owned) */
${RESET}{
  width:100%;
  margin-top:8px;
  padding:8px 10px;
  border-radius:999px;
  border:none;
  cursor:pointer;
  font-size:12px;
  font-weight:600;
  background: var(--ho-accent-dark);
  color:#020617;
}

/* accent grid */
${PANEL} [data-part="agrid"]{
  display:grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap:10px;
  margin-top:10px;
}
${PANEL} [data-part="agrid"][data-layout="compact"]{
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap:8px;
}
${PANEL} [data-part="acard"]{
  display:flex; flex-direction:column; align-items:flex-start; gap:4px;
  padding:8px 9px;
  border-radius:999px;
  border:1px solid rgba(148,163,253,0.25);
  background: radial-gradient(circle at top left, rgba(15,23,42,0.9), rgba(15,23,42,0.98));
  cursor:pointer;
  transition: border-color 120ms ease, background 120ms ease, transform 80ms ease, box-shadow 120ms ease;
}
${PANEL} [data-part="acard"]:hover{
  background: radial-gradient(circle at top left, rgba(148,163,253,0.18), rgba(15,23,42,0.98));
  box-shadow: 0 6px 18px rgba(0,0,0,0.55);
  transform: translateY(-0.5px);
}
${PANEL} [data-part="acard"][${ATTR_CGXUI_STATE}="on"]{
  border-color: rgba(190,227,248,0.9);
  box-shadow: 0 0 0 1px rgba(190,227,248,0.4), 0 8px 22px rgba(0,0,0,0.75);
}
${PANEL} [data-part="apill"]{ display:flex; width:100%; height:18px; border-radius:999px; overflow:hidden; }
${PANEL} [data-part="ahalf"]{ flex:1; }
${PANEL} [data-part="aname"]{ font-size:11px; opacity:0.9; }
${PANEL} [data-part="acard"][data-size="compact"]{
  gap:6px;
  padding:7px 8px 8px;
  border-radius:18px;
}
${PANEL} [data-part="acard"][data-size="compact"] [data-part="apill"]{
  height:14px;
}
${PANEL} [data-part="acard"][data-size="compact"] [data-part="aname"]{
  font-size:10px;
  font-weight:600;
  line-height:1.2;
}

/* compact mode control */
${PANEL} [data-part="modegrid"]{
  display:grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap:8px;
  margin-top:8px;
}
${PANEL} [data-part="mchip"]{
  min-width:0;
  border-radius:16px;
  padding:9px 8px;
  border:1px solid rgba(148,163,253,0.26);
  background: linear-gradient(180deg, rgba(30,41,59,0.72), rgba(15,23,42,0.94));
  color:inherit;
  font-size:12px;
  font-weight:600;
  text-align:center;
  cursor:pointer;
  transition: border-color 120ms ease, background 120ms ease, transform 80ms ease, box-shadow 120ms ease;
}
${PANEL} [data-part="mchip"]:hover{
  border-color: rgba(190,227,248,0.48);
  box-shadow: 0 6px 16px rgba(0,0,0,0.45);
  transform: translateY(-0.5px);
}
${PANEL} [data-part="mchip"][${ATTR_CGXUI_STATE}="on"]{
  border-color: color-mix(in srgb, var(--ho-accent-light) 68%, white 32%);
  background: linear-gradient(180deg, color-mix(in srgb, var(--ho-accent-dark) 82%, white 18%), var(--ho-accent-dark));
  color:#020617;
  box-shadow: 0 8px 20px color-mix(in srgb, var(--ho-accent-dark) 30%, transparent);
}
${PANEL}[${ATTR_CGXUI_STATE}="light"] [data-part="mchip"]{
  background: linear-gradient(180deg, rgba(255,255,255,0.78), rgba(226,232,240,0.96));
}

@media (max-width: 360px) {
  ${PANEL} [data-part="agrid"][data-layout="compact"]{
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* custom accent */
${PANEL} [data-part="acustom"]{
  margin-top:10px;
  align-self:flex-start;
  padding:4px 10px;
  border-radius:999px;
  border:1px dashed rgba(148,163,253,0.55);
  background:transparent;
  color:inherit;
  font-size:11px;
  cursor:pointer;
  opacity:0.9;
  transition: background 120ms ease, border-color 120ms ease, transform 80ms ease;
}
${PANEL} [data-part="acustom"]:hover{
  background: rgba(30,64,175,0.28);
  border-color: rgba(191,219,254,0.9);
  transform: translateY(-0.3px);
}
${PANEL} [data-part="aedit"]{
  margin-top:8px;
  padding:8px 9px 10px;
  border-radius:14px;
  border:1px solid rgba(148,163,253,0.25);
  background: radial-gradient(circle at top left, rgba(15,23,42,0.96), rgba(15,23,42,0.98));
  display:flex;
  flex-direction:column;
  gap:6px;
}
${PANEL} [data-part="arow"]{ display:flex; align-items:center; gap:10px; }
${PANEL} [data-part="aprev"]{
  width:26px; height:26px;
  border-radius:999px;
  border:1px solid rgba(15,23,42,0.9);
  box-shadow: 0 0 0 1px rgba(15,23,42,0.9), 0 4px 10px rgba(0,0,0,0.6);
}
${PANEL} [data-part="avals"]{ display:flex; flex-wrap:wrap; gap:6px; font-size:10px; opacity:0.9; }
${PANEL} [data-part="aval"] span{ font-weight:600; }
${PANEL} [data-part="srow"]{ display:flex; align-items:center; gap:8px; font-size:11px; }
${PANEL} [data-part="srow"] span{ width:70px; opacity:0.9; }
${PANEL} [data-part="srow"] input[type="range"]{ flex:1; }

.cgxui-${SkID}-docktab{
  display:flex;
  flex-direction:column;
  gap:10px;
  padding:8px 8px 18px;
  color:rgba(248,250,252,0.92);
}
.cgxui-${SkID}-docksec{
  border:1px solid rgba(148,163,184,0.22);
  background:rgba(15,23,42,0.42);
  border-radius:10px;
  padding:10px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,0.04);
}
.cgxui-${SkID}-dockttl{
  font-size:12px;
  line-height:1.2;
  font-weight:800;
  letter-spacing:0;
  margin:0 0 8px;
}
.cgxui-${SkID}-dockrow{
  display:grid;
  grid-template-columns:minmax(0, 1fr) minmax(96px, 128px);
  align-items:center;
  gap:8px;
  min-height:32px;
  padding:5px 0;
}
.cgxui-${SkID}-docklab{
  min-width:0;
  font-size:12px;
  line-height:1.25;
  font-weight:650;
  color:rgba(248,250,252,0.9);
}
.cgxui-${SkID}-dockhint{
  display:block;
  margin-top:2px;
  font-size:10px;
  line-height:1.2;
  font-weight:500;
  color:rgba(203,213,225,0.72);
}
.cgxui-${SkID}-docksel,
.cgxui-${SkID}-dockbtn{
  width:100%;
  min-height:28px;
  border-radius:8px;
  border:1px solid rgba(148,163,184,0.28);
  background:rgba(2,6,23,0.44);
  color:rgba(248,250,252,0.94);
  font:600 12px/1.2 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  outline:none;
}
.cgxui-${SkID}-docksel{
  padding:0 8px;
}
.cgxui-${SkID}-dockbtn{
  cursor:pointer;
}
.cgxui-${SkID}-dockbtn[aria-pressed="true"]{
  border-color:rgba(196,181,253,0.72);
  background:linear-gradient(135deg, rgba(196,181,253,0.34), rgba(168,85,247,0.22));
}
.cgxui-${SkID}-dockrange{
  display:flex;
  align-items:center;
  gap:7px;
}
.cgxui-${SkID}-dockrange input{
  width:100%;
  min-width:0;
}
.cgxui-${SkID}-dockval{
  width:42px;
  flex:0 0 42px;
  text-align:right;
  font-size:10px;
  color:rgba(203,213,225,0.86);
}
.cgxui-${SkID}-dockactions{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:8px;
  margin-top:8px;
}
.cgxui-${SkID}-dockactions .cgxui-${SkID}-dockbtn{
  min-height:30px;
}

/* tiny rail themes button: dock-panel badge style fallback */
${TINYBTN} .${CLS_DOCK_RAIL_NAV_BTN}{
  width: var(--cgxui-rail-btn-w, 24px);
  height: var(--cgxui-rail-btn-h, 24px);
  display: block;
  border-radius: 8px;
  background:
    linear-gradient(145deg, rgba(255,255,255,0.03), rgba(0,0,0,0.10)),
    var(--cgxui-btn-bg, #777) !important;
  opacity: 0.78;
  box-shadow:
    inset 0 0 1px rgba(255,255,255,0.05),
    0 2px 5px rgba(0,0,0,0.30);
  transition: opacity .18s ease, filter .18s ease, box-shadow .18s ease, transform .18s ease;
  pointer-events: none;
  position: relative;
}
[${ATTR_TINY_RAIL_VIEW}="${TINY_RAIL_VIEW_THEMES}"]:hover .${CLS_DOCK_RAIL_NAV_BTN}{
  opacity: 1;
  filter: brightness(1.08);
  box-shadow:
    0 0 6px 2px rgba(255,255,255,0.08),
    0 2px 4px rgba(0,0,0,0.25);
}
${TINYBTN} .${CLS_DOCK_RAIL_NAV_TXT}{
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI Variable Text", "Inter", "SF Pro Display", "Helvetica Neue", Arial, sans-serif;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.55px;
  color: rgba(255,255,255,0.72);
  opacity: 0.88;
  text-shadow: 0 1px 0 rgba(0,0,0,0.45);
  pointer-events: none;
  user-select: none;
}
${TINYBTN} .${CLS_DOCK_RAIL_NAV_TXT} svg{
  width: 14px;
  height: 14px;
  display: block;
}
`;
  }

  /* ───────────────────────────── 🟨 TIME — SCHEDULING / REACTIVITY 📝🔓💥 ───────────────────────────── */

  function TIME_TP_scheduleEnsureTinyRail() {
    if (STATE.rafTinyRail) return;
    STATE.rafTinyRail = W.requestAnimationFrame(() => {
      STATE.rafTinyRail = 0;
      try { UI_TP_ensureTinyRailButton(); } catch {}
    });
  }

  /* ───────────────────────────── 🟦 SURFACE — EVENTS / API / PORTS 📄🔓💧 ───────────────────────────── */
  // Stage-1: surface published via H2O vault api (below)

  /* ───────────────────────────── 🟧 BOUNDARIES — UI / PANEL 📝🔓💥 ───────────────────────────── */

  function UI_TP_togglePanel() {
    if (STATE.panelBackdrop) UI_TP_closePanel();
    else UI_TP_openPanel();
  }

  function UI_TP_panelTone() {
    if (STATE.settings?.mode === 'light') return 'light';
    if (STATE.settings?.mode === 'system') {
      return W.matchMedia?.('(prefers-color-scheme: light)')?.matches ? 'light' : 'dark';
    }
    return 'dark';
  }

  function UI_TP_refreshEnableControls() {
    if (!STATE.panelEl) return;
    const buttons = STATE.panelEl.querySelectorAll(DOM_selScoped(UI_TPANEL_ENABLE));
    buttons.forEach((btn) => {
      btn.textContent = STATE.settings?.enabled ? 'Theme: ON' : 'Theme: OFF';
      btn.setAttribute(ATTR_CGXUI_STATE, STATE.settings?.enabled ? 'on' : 'off');
    });
  }

  function CORE_TP_enablePageTheme() {
    if (!STATE.settings || STATE.settings.enabled) return false;
    STATE.settings.enabled = true;
    return true;
  }

  function UI_TP_clampPanelPos(panel, left, top) {
    const width = Math.min(panel.offsetWidth || CFG_PANEL_WIDTH_PX, W.innerWidth - (CFG_PANEL_VP_MARGIN_PX * 2));
    const height = Math.min(panel.offsetHeight || 0, Math.max(240, W.innerHeight - (CFG_PANEL_VP_MARGIN_PX * 2)));
    const minLeft = W.scrollX + CFG_PANEL_VP_MARGIN_PX;
    const maxLeft = Math.max(minLeft, W.scrollX + W.innerWidth - width - CFG_PANEL_VP_MARGIN_PX);
    const minTop = W.scrollY + CFG_PANEL_VP_MARGIN_PX;
    const maxTop = Math.max(minTop, W.scrollY + W.innerHeight - height - CFG_PANEL_VP_MARGIN_PX);
    return {
      left: Math.min(Math.max(left, minLeft), maxLeft),
      top: Math.min(Math.max(top, minTop), maxTop),
    };
  }

  function UI_TP_setPanelPos(panel, left, top) {
    const next = UI_TP_clampPanelPos(panel, left, top);
    panel.style.left = `${Math.round(next.left)}px`;
    panel.style.top = `${Math.round(next.top)}px`;
    STATE.panelPos = next;
  }

  function UI_TP_wirePanelDrag(panel, handle) {
    if (!panel || !handle) return () => {};

    let activePointerId = null;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;

    const onPointerMove = (ev) => {
      if (ev.pointerId !== activePointerId) return;
      UI_TP_setPanelPos(panel, originLeft + (ev.clientX - startX), originTop + (ev.clientY - startY));
    };

    const stopDrag = () => {
      if (activePointerId == null) return;
      try { handle.releasePointerCapture(activePointerId); } catch {}
      activePointerId = null;
      handle.removeAttribute('data-dragging');
      W.removeEventListener('pointermove', onPointerMove, true);
      W.removeEventListener('pointerup', stopDrag, true);
      W.removeEventListener('pointercancel', stopDrag, true);
    };

    const onPointerDown = (ev) => {
      if (ev.button !== 0) return;
      if (ev.target?.closest?.('button, input, textarea, select, label, a')) return;
      const rect = panel.getBoundingClientRect();
      activePointerId = ev.pointerId;
      startX = ev.clientX;
      startY = ev.clientY;
      originLeft = W.scrollX + rect.left;
      originTop = W.scrollY + rect.top;
      handle.setAttribute('data-dragging', 'true');
      try { handle.setPointerCapture(activePointerId); } catch {}
      W.addEventListener('pointermove', onPointerMove, true);
      W.addEventListener('pointerup', stopDrag, true);
      W.addEventListener('pointercancel', stopDrag, true);
      ev.preventDefault();
    };

    handle.addEventListener('pointerdown', onPointerDown);

    return () => {
      stopDrag();
      handle.removeEventListener('pointerdown', onPointerDown);
    };
  }

  function UI_TP_closePanel() {
    try { STATE.panelDragCleanup?.(); } catch {}
    STATE.panelDragCleanup = null;
    if (STATE.panelBackdrop && STATE.panelBackdrop.parentNode) {
      STATE.panelBackdrop.parentNode.removeChild(STATE.panelBackdrop);
    }
    STATE.panelBackdrop = null;
    STATE.panelEl = null;

    UTIL_dispatchEvt(EV_TPANEL_PANEL_CLOSE, null);
  }

  function UI_TP_openPanel() {
    UI_TP_closePanel();
    DOM_TP_ensureStyle();

    const backdrop = D.createElement('div');
    backdrop.setAttribute(ATTR_CGXUI, UI_TPANEL_BACKDROP);
    backdrop.setAttribute(ATTR_CGXUI_OWNER, SkID);

    const panel = D.createElement('div');
    panel.setAttribute(ATTR_CGXUI, UI_TPANEL_PANEL);
    panel.setAttribute(ATTR_CGXUI_OWNER, SkID);
    panel.setAttribute(ATTR_CGXUI_STATE, UI_TP_panelTone());

    // Build structure (no global classes)
    panel.innerHTML = `
      <div data-part="hdr">
        <div data-part="hdrrow" data-role="drag-handle">
          <div data-part="ttl"><span>GPThemes</span> Customization</div>
          <div data-part="hdractions">
            <button type="button"
              ${ATTR_CGXUI}="${UI_TPANEL_ENABLE}"
              ${ATTR_CGXUI_OWNER}="${SkID}"
              ></button>
            <button type="button"
              ${ATTR_CGXUI}="${UI_TPANEL_CLOSE}"
              ${ATTR_CGXUI_OWNER}="${SkID}"
              aria-label="Close themes panel"
              title="Close"
            >&times;</button>
          </div>
        </div>
      </div>

      <div data-part="tabs">
        <button type="button"
          ${ATTR_CGXUI}="${UI_TPANEL_TABBTN}"
          ${ATTR_CGXUI_OWNER}="${SkID}"
          data-tab="color"
          ${ATTR_CGXUI_STATE}="active"
        >Theme</button>

        <button type="button"
          ${ATTR_CGXUI}="${UI_TPANEL_TABBTN}"
          ${ATTR_CGXUI_OWNER}="${SkID}"
          data-tab="font"
        >Font</button>

        <button type="button"
          ${ATTR_CGXUI}="${UI_TPANEL_TABBTN}"
          ${ATTR_CGXUI_OWNER}="${SkID}"
          data-tab="layout"
        >Layout</button>
      </div>

      <div data-part="content">
        <div ${ATTR_CGXUI}="${UI_TPANEL_PANE}" ${ATTR_CGXUI_OWNER}="${SkID}" data-pane="color" ${ATTR_CGXUI_STATE}="active"></div>
        <div ${ATTR_CGXUI}="${UI_TPANEL_PANE}" ${ATTR_CGXUI_OWNER}="${SkID}" data-pane="font"></div>
        <div ${ATTR_CGXUI}="${UI_TPANEL_PANE}" ${ATTR_CGXUI_OWNER}="${SkID}" data-pane="layout"></div>
      </div>

      <button type="button"
        ${ATTR_CGXUI}="${UI_TPANEL_RESET}"
        ${ATTR_CGXUI_OWNER}="${SkID}"
        data-section="color"
      >Reset</button>
    `;

    backdrop.appendChild(panel);
    D.body.appendChild(backdrop);

    STATE.panelBackdrop = backdrop;
    STATE.panelEl = panel;

    // Position
    if (STATE.panelPos) {
      UI_TP_setPanelPos(panel, STATE.panelPos.left, STATE.panelPos.top);
    } else {
      const anchor = D.querySelector('header');
      const centerLeft = W.scrollX + (W.innerWidth - CFG_PANEL_WIDTH_PX) / 2;
      const topBase = anchor ? (anchor.getBoundingClientRect().bottom + W.scrollY) : W.scrollY + CFG_PANEL_VP_MARGIN_PX;
      const top = Math.max(W.scrollY + CFG_PANEL_VP_MARGIN_PX, topBase + CFG_PANEL_GAP_PX);
      UI_TP_setPanelPos(panel, centerLeft, top);
    }

    const colorPane  = panel.querySelector('[data-pane="color"]');
    const fontPane   = panel.querySelector('[data-pane="font"]');
    const layoutPane = panel.querySelector('[data-pane="layout"]');
    const dragHandle = panel.querySelector('[data-role="drag-handle"]');
    const closeBtn = panel.querySelector(DOM_selScoped(UI_TPANEL_CLOSE));

    STATE.panelDragCleanup = UI_TP_wirePanelDrag(panel, dragHandle);
    closeBtn?.addEventListener('click', UI_TP_closePanel);

    UI_TP_buildColorPane(colorPane);
    UI_TP_buildFontPane(fontPane);
    UI_TP_buildLayoutPane(layoutPane);

    // Tabs
    const tabs = Array.from(panel.querySelectorAll(DOM_selScoped(UI_TPANEL_TABBTN)));
    const panes = { color: colorPane, font: fontPane, layout: layoutPane };

    function activateTab(name) {
      tabs.forEach(t => t.setAttribute(ATTR_CGXUI_STATE, (t.dataset.tab === name) ? 'active' : ''));
      Object.entries(panes).forEach(([k, el]) => el.setAttribute(ATTR_CGXUI_STATE, (k === name) ? 'active' : ''));
      const r = panel.querySelector(DOM_selScoped(UI_TPANEL_RESET));
      if (r) r.dataset.section = name;
    }

    tabs.forEach(t => t.addEventListener('click', () => activateTab(t.dataset.tab)));
    activateTab('color');

    // Reset
    const resetBtn = panel.querySelector(DOM_selScoped(UI_TPANEL_RESET));
    resetBtn.addEventListener('click', () => {
      const sec = resetBtn.dataset.section || 'color';
      CORE_TP_resetSection(sec);

      UI_TP_buildColorPane(colorPane);
      UI_TP_buildFontPane(fontPane);
      UI_TP_buildLayoutPane(layoutPane);

      panel.setAttribute(ATTR_CGXUI_STATE, UI_TP_panelTone());
    });

    // Enable toggle
    const toggleBtn = panel.querySelector(DOM_selScoped(UI_TPANEL_ENABLE));
    UI_TP_refreshEnableControls();

    toggleBtn.addEventListener('click', () => {
      STATE.settings.enabled = !STATE.settings.enabled;
      CORE_TP_saveSettings();
      DOM_TP_applySettings();
      UI_TP_refreshEnableControls();
    });

    UTIL_dispatchEvt(EV_TPANEL_PANEL_OPEN, null);
  }

  /* ───────────────────────────── 🟧 BOUNDARIES — UI PANES 📝🔓💥 ───────────────────────────── */

  function UI_TP_buildColorPane(root) {
    if (!root) return;
    root.innerHTML = '';

    const themeCard = D.createElement('div');
    themeCard.setAttribute('data-part', 'card');
    themeCard.innerHTML = `
      <div data-part="cardttl">Theme</div>
      <div data-part="lbl">Controls the ChatGPT page styling</div>
      <div data-part="agrid" data-role="theme-grid"></div>
    `;
    root.appendChild(themeCard);

    const accentCard = D.createElement('div');
    accentCard.setAttribute('data-part', 'card');
    accentCard.innerHTML = `
      <div data-part="cardttl">Accent</div>
      <div data-part="lbl">Matches ChatGPT accent color setting</div>
      <div data-part="agrid" data-layout="compact" data-role="accent-grid"></div>
    `;
    root.appendChild(accentCard);

    const modeCard = D.createElement('div');
    modeCard.setAttribute('data-part', 'card');
    modeCard.innerHTML = `
      <div data-part="cardttl">Mode</div>
      <div data-part="lbl">Matches ChatGPT appearance setting</div>
      <div data-part="modegrid" data-role="mode-grid">
        ${MODE_PRESETS.map(mode => `<button type="button" data-part="mchip" data-mode="${mode.key}"><span>${mode.name}</span></button>`).join('')}
      </div>
    `;
    root.appendChild(modeCard);

    const themeGrid = themeCard.querySelector('[data-role="theme-grid"]');
    const accentGrid = accentCard.querySelector('[data-role="accent-grid"]');
    const currentTheme = CORE_TP_normalizeThemePreset(STATE.settings.themePreset);
    const currentAccent = CORE_TP_normalizeNativeAccent(STATE.settings.nativeAccent);

    THEME_PRESETS.forEach(p => {
      const item = D.createElement('button');
      item.type = 'button';
      item.setAttribute('data-part', 'acard');
      item.innerHTML = `
        <div data-part="apill">
          <div data-part="ahalf" data-role="light"></div>
          <div data-part="ahalf" data-role="dark"></div>
        </div>
        <div data-part="aname">${p.name}</div>
      `;

      const lightEl = item.querySelector('[data-role="light"]');
      const darkEl  = item.querySelector('[data-role="dark"]');
      lightEl.style.background = `hsl(${p.light})`;
      darkEl.style.background  = `hsl(${p.dark})`;

      const isActive = (p.key === currentTheme);
      if (isActive) item.setAttribute(ATTR_CGXUI_STATE, 'on');

      item.addEventListener('click', () => {
        CORE_TP_enablePageTheme();
        CORE_TP_applyThemePreset(STATE.settings, p.key);
        CORE_TP_saveSettings();
        DOM_TP_applySettings();
        UI_TP_refreshEnableControls();
        Array.from(themeGrid.children).forEach(ch => ch.removeAttribute(ATTR_CGXUI_STATE));
        item.setAttribute(ATTR_CGXUI_STATE, 'on');
      });

      themeGrid.appendChild(item);
    });

    NATIVE_ACCENT_PRESETS.forEach(p => {
      const item = D.createElement('button');
      item.type = 'button';
      item.setAttribute('data-part', 'acard');
      item.setAttribute('data-size', 'compact');
      item.innerHTML = `
        <div data-part="apill">
          <div data-part="ahalf" data-role="light"></div>
          <div data-part="ahalf" data-role="dark"></div>
        </div>
        <div data-part="aname">${p.name}</div>
      `;

      const lightEl = item.querySelector('[data-role="light"]');
      const darkEl  = item.querySelector('[data-role="dark"]');
      lightEl.style.background = `hsl(${p.light})`;
      darkEl.style.background  = `hsl(${p.dark})`;

      if (p.key === currentAccent) item.setAttribute(ATTR_CGXUI_STATE, 'on');

      item.addEventListener('click', () => {
        STATE.settings.nativeAccent = CORE_TP_normalizeNativeAccent(p.key);
        CORE_TP_saveSettings();
        DOM_TP_applySettings();
        NATIVE_queueSetting('accent', p.key);
        Array.from(accentGrid.children).forEach(ch => ch.removeAttribute(ATTR_CGXUI_STATE));
        item.setAttribute(ATTR_CGXUI_STATE, 'on');
      });

      accentGrid.appendChild(item);
    });

    const modeCards = modeCard.querySelectorAll('[data-mode]');
    modeCards.forEach(mc => {
      mc.setAttribute(ATTR_CGXUI_STATE, (mc.dataset.mode === STATE.settings.mode) ? 'on' : '');
      mc.addEventListener('click', () => {
        STATE.settings.mode = CORE_TP_normalizeMode(mc.dataset.mode);
        CORE_TP_saveSettings();
        DOM_TP_applySettings();
        NATIVE_queueSetting('mode', STATE.settings.mode);
        modeCards.forEach(m => m.setAttribute(ATTR_CGXUI_STATE, (m === mc) ? 'on' : ''));
        if (STATE.panelEl) STATE.panelEl.setAttribute(ATTR_CGXUI_STATE, UI_TP_panelTone());
      });
    });
  }

  function UI_TP_refreshColorPaneIfOpen() {
    const colorPane = STATE.panelEl?.querySelector?.('[data-pane="color"]');
    if (!colorPane) return;
    UI_TP_buildColorPane(colorPane);
    STATE.panelEl.setAttribute(ATTR_CGXUI_STATE, UI_TP_panelTone());
  }

  function UI_TP_refreshFontPaneIfOpen() {
    const fontPane = STATE.panelEl?.querySelector?.('[data-pane="font"]');
    if (!fontPane) return;
    UI_TP_buildFontPane(fontPane);
  }

  function UI_TP_refreshLayoutPaneIfOpen() {
    const layoutPane = STATE.panelEl?.querySelector?.('[data-pane="layout"]');
    if (!layoutPane) return;
    UI_TP_buildLayoutPane(layoutPane);
  }

  function API_TP_getSettings() {
    return STATE.settings ? { ...STATE.settings } : null;
  }

  function API_TP_updateSettings(patch = {}) {
    if (!patch || typeof patch !== 'object') return API_TP_getSettings();
    if (!STATE.settings) STATE.settings = CORE_TP_loadSettings();

    const S = STATE.settings;
    let colorChanged = false;
    let fontChanged = false;
    let layoutChanged = false;
    let modeToSync = null;
    let accentToSync = null;

    if (Object.prototype.hasOwnProperty.call(patch, 'enabled')) {
      S.enabled = !!patch.enabled;
      colorChanged = true;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'mode')) {
      S.mode = CORE_TP_normalizeMode(patch.mode);
      modeToSync = S.mode;
      colorChanged = true;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'themePreset')) {
      CORE_TP_enablePageTheme();
      CORE_TP_applyThemePreset(S, patch.themePreset);
      colorChanged = true;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'nativeAccent')) {
      S.nativeAccent = CORE_TP_normalizeNativeAccent(patch.nativeAccent);
      accentToSync = S.nativeAccent;
      colorChanged = true;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'fontFamily')) {
      S.fontFamily = CORE_TP_normalizeFontFamily(patch.fontFamily);
      fontChanged = true;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'fontScope')) {
      S.fontScope = CORE_TP_normalizeFontScope(patch.fontScope);
      fontChanged = true;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'fontSize')) {
      S.fontSize = CORE_TP_clampNumber(patch.fontSize, DEFAULT_SETTINGS.fontSize, 12, 22, 0);
      fontChanged = true;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'lineHeight')) {
      S.lineHeight = CORE_TP_clampNumber(patch.lineHeight, DEFAULT_SETTINGS.lineHeight, 18, 34, 0);
      fontChanged = true;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'letterSpace')) {
      S.letterSpace = CORE_TP_clampNumber(patch.letterSpace, DEFAULT_SETTINGS.letterSpace, -1, 2, 1);
      fontChanged = true;
    }

    const hasSyncPrompt = Object.prototype.hasOwnProperty.call(patch, 'syncPromptWidth');
    const hasChatWidth = Object.prototype.hasOwnProperty.call(patch, 'chatWidth');
    const hasPromptWidth = Object.prototype.hasOwnProperty.call(patch, 'promptWidth');

    if (hasSyncPrompt) {
      S.syncPromptWidth = !!patch.syncPromptWidth;
      layoutChanged = true;
    }

    if (hasChatWidth) {
      S.chatWidth = CORE_TP_clampNumber(patch.chatWidth, DEFAULT_SETTINGS.chatWidth, 40, 70, 0);
      if (S.syncPromptWidth) S.promptWidth = S.chatWidth;
      layoutChanged = true;
    }

    if (hasPromptWidth) {
      S.promptWidth = CORE_TP_clampNumber(patch.promptWidth, DEFAULT_SETTINGS.promptWidth, 40, 70, 0);
      if (!hasSyncPrompt || !S.syncPromptWidth) S.syncPromptWidth = false;
      layoutChanged = true;
    }

    if (hasSyncPrompt && S.syncPromptWidth) {
      S.promptWidth = S.chatWidth;
      layoutChanged = true;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'chatFullWidth')) {
      S.chatFullWidth = !!patch.chatFullWidth;
      layoutChanged = true;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'hideHeader')) {
      S.hideHeader = !!patch.hideHeader;
      layoutChanged = true;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'hideFooter')) {
      S.hideFooter = !!patch.hideFooter;
      layoutChanged = true;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'expandChatbox')) {
      S.expandChatbox = !!patch.expandChatbox;
      layoutChanged = true;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'scrollAlign')) {
      const next = String(patch.scrollAlign || '').trim().toLowerCase();
      S.scrollAlign = ['left', 'center', 'right'].includes(next) ? next : DEFAULT_SETTINGS.scrollAlign;
      layoutChanged = true;
    }

    CORE_TP_saveSettings();
    DOM_TP_applySettings();
    UI_TP_refreshEnableControls();
    if (colorChanged) UI_TP_refreshColorPaneIfOpen();
    if (fontChanged) UI_TP_refreshFontPaneIfOpen();
    if (layoutChanged) UI_TP_refreshLayoutPaneIfOpen();
    if (modeToSync) NATIVE_queueSetting('mode', modeToSync);
    if (accentToSync) NATIVE_queueSetting('accent', accentToSync);
    return API_TP_getSettings();
  }

  function API_TP_setMode(value) {
    const next = CORE_TP_normalizeMode(value);
    STATE.settings.mode = next;
    CORE_TP_saveSettings();
    DOM_TP_applySettings();
    UI_TP_refreshColorPaneIfOpen();
    NATIVE_queueSetting('mode', next);
    return next;
  }

  function API_TP_setThemePreset(value) {
    CORE_TP_enablePageTheme();
    const preset = CORE_TP_applyThemePreset(STATE.settings, value);
    CORE_TP_saveSettings();
    DOM_TP_applySettings();
    UI_TP_refreshEnableControls();
    UI_TP_refreshColorPaneIfOpen();
    return preset.key;
  }

  function API_TP_setNativeAccent(value) {
    const next = CORE_TP_normalizeNativeAccent(value);
    STATE.settings.nativeAccent = next;
    CORE_TP_saveSettings();
    DOM_TP_applySettings();
    UI_TP_refreshColorPaneIfOpen();
    NATIVE_queueSetting('accent', next);
    return next;
  }

  function API_TP_listThemePresets() {
    return THEME_PRESETS.map(preset => ({ ...preset }));
  }

  function API_TP_listNativeAccents() {
    return NATIVE_ACCENT_PRESETS.map(preset => ({ ...preset }));
  }

  function API_TP_listFontPresets() {
    return FONT_PRESETS.map(preset => ({ ...preset }));
  }

  function API_TP_listFontScopes() {
    return FONT_SCOPE_PRESETS.map(preset => ({ ...preset }));
  }

  function UI_TP_buildFontPane(root) {
    if (!root) return;
    root.innerHTML = '';

    const card = D.createElement('div');
    card.setAttribute('data-part', 'card');
    card.innerHTML = `
      <div data-part="cardttl">Font Family</div>
      <div data-part="fgrid">
        ${FONT_PRESETS.map((preset) => (
          `<div data-part="fcard" data-font="${preset.key}"><span>${preset.name}</span></div>`
        )).join('')}
      </div>
    `;
    root.appendChild(card);

    const scopeCard = D.createElement('div');
    scopeCard.setAttribute('data-part', 'card');
    scopeCard.innerHTML = `
      <div data-part="cardttl">Font Scope</div>
      <div data-part="fgrid">
        ${FONT_SCOPE_PRESETS.map((preset) => (
          `<div data-part="fcard" data-font-scope="${preset.key}"><span>${preset.name}</span><span data-role="hint">${preset.hint}</span></div>`
        )).join('')}
      </div>
    `;
    root.appendChild(scopeCard);

    const metrics = D.createElement('div');
    metrics.setAttribute('data-part', 'card');
    metrics.innerHTML = `
      <div data-part="cardttl">Font Metrics</div>

      <div data-part="srow">
        <label>Font Size (<span data-role="fs-v"></span>px)</label>
        <input type="range" min="12" max="22" step="1" data-role="fs">
      </div>

      <div data-part="srow">
        <label>Line Height (<span data-role="lh-v"></span>px)</label>
        <input type="range" min="18" max="34" step="1" data-role="lh">
      </div>

      <div data-part="srow">
        <label>Letter Space (<span data-role="ls-v"></span>px)</label>
        <input type="range" min="-1" max="2" step="0.1" data-role="ls">
      </div>
    `;
    root.appendChild(metrics);

    const cards = root.querySelectorAll('[data-font]');
    cards.forEach(c => {
      const f = c.dataset.font;
      c.setAttribute(ATTR_CGXUI_STATE, f === STATE.settings.fontFamily ? 'on' : '');
      c.addEventListener('click', () => {
        STATE.settings.fontFamily = f;
        CORE_TP_saveSettings();
        DOM_TP_applySettings();
        cards.forEach(x => x.setAttribute(ATTR_CGXUI_STATE, (x === c) ? 'on' : ''));
      });
    });

    const scopeCards = root.querySelectorAll('[data-font-scope]');
    scopeCards.forEach(c => {
      const scope = CORE_TP_normalizeFontScope(c.dataset.fontScope);
      c.setAttribute(ATTR_CGXUI_STATE, scope === CORE_TP_normalizeFontScope(STATE.settings.fontScope) ? 'on' : '');
      c.addEventListener('click', () => {
        STATE.settings.fontScope = scope;
        CORE_TP_saveSettings();
        DOM_TP_applySettings();
        scopeCards.forEach(x => x.setAttribute(ATTR_CGXUI_STATE, (x === c) ? 'on' : ''));
      });
    });

    const fs = root.querySelector('[data-role="fs"]');
    const lh = root.querySelector('[data-role="lh"]');
    const ls = root.querySelector('[data-role="ls"]');
    const fsV = root.querySelector('[data-role="fs-v"]');
    const lhV = root.querySelector('[data-role="lh-v"]');
    const lsV = root.querySelector('[data-role="ls-v"]');

    function syncVals() {
      fsV.textContent = String(STATE.settings.fontSize);
      lhV.textContent = String(STATE.settings.lineHeight);
      lsV.textContent = String(STATE.settings.letterSpace);
    }

    fs.value = String(STATE.settings.fontSize);
    lh.value = String(STATE.settings.lineHeight);
    ls.value = String(STATE.settings.letterSpace);
    syncVals();

    fs.addEventListener('input', () => {
      STATE.settings.fontSize = parseInt(fs.value, 10);
      CORE_TP_saveSettings();
      DOM_TP_applySettings();
      syncVals();
    });

    lh.addEventListener('input', () => {
      STATE.settings.lineHeight = parseInt(lh.value, 10);
      CORE_TP_saveSettings();
      DOM_TP_applySettings();
      syncVals();
    });

    ls.addEventListener('input', () => {
      STATE.settings.letterSpace = parseFloat(ls.value);
      CORE_TP_saveSettings();
      DOM_TP_applySettings();
      syncVals();
    });
  }

  function UI_TP_buildLayoutPane(root) {
    if (!root) return;
    root.innerHTML = '';

    const widthCard = D.createElement('div');
    widthCard.setAttribute('data-part', 'card');
    widthCard.innerHTML = `
      <div data-part="cardttl">Widths</div>

      <div data-part="srow">
        <label>Chats width (<span data-role="cw-v"></span> rem)</label>
        <input type="range" min="40" max="70" step="1" data-role="cw">
      </div>

      <div data-part="srow">
        <label>Prompt width (<span data-role="pw-v"></span> rem)</label>
        <input type="range" min="40" max="70" step="1" data-role="pw">
      </div>
    `;
    root.appendChild(widthCard);

    const togglesCard = D.createElement('div');
    togglesCard.setAttribute('data-part', 'card');
    togglesCard.innerHTML = `
      <div data-part="cardttl">Hide Elements</div>

      <div data-part="swrow">
        <div data-part="swmeta">
          <span>HIDE HEADER</span>
          <span>Hide the top header section to maximize screen space.</span>
        </div>
        <div data-part="sw" data-role="hide-header"></div>
      </div>

      <div data-part="swrow">
        <div data-part="swmeta">
          <span>HIDE FOOTER</span>
          <span>Hide info below the message box for a cleaner view.</span>
        </div>
        <div data-part="sw" data-role="hide-footer"></div>
      </div>

      <div data-part="swrow">
        <div data-part="swmeta">
          <span>EXPAND CHATBOX</span>
          <span>Increase the height of the message box to fit more content.</span>
        </div>
        <div data-part="sw" data-role="expand-chatbox"></div>
      </div>
    `;
    root.appendChild(togglesCard);

    const otherCard = D.createElement('div');
    otherCard.setAttribute('data-part', 'card');
    otherCard.innerHTML = `
      <div data-part="cardttl">Other</div>

      <div data-part="swrow">
        <div data-part="swmeta">
          <span>CHAT FULL WIDTH</span>
          <span>Expand chats to screen's edge for wider view.</span>
        </div>
        <div data-part="sw" data-role="chat-full"></div>
      </div>

      <div data-part="swrow">
        <div data-part="swmeta">
          <span>SYNC PROMPT WIDTH</span>
          <span>Adjust prompt field to match chat width.</span>
        </div>
        <div data-part="sw" data-role="sync-prompt"></div>
      </div>
    `;
    root.appendChild(otherCard);

    const scrollCard = D.createElement('div');
    scrollCard.setAttribute('data-part', 'card');
    scrollCard.innerHTML = `
      <div data-part="cardttl">Scrolldown Button Align</div>
      <div data-part="fgrid">
        <div data-part="fcard" data-scroll="left"><span>Left</span></div>
        <div data-part="fcard" data-scroll="center"><span>Center</span></div>
        <div data-part="fcard" data-scroll="right"><span>Right</span></div>
      </div>
    `;
    root.appendChild(scrollCard);

    const cw = root.querySelector('[data-role="cw"]');
    const pw = root.querySelector('[data-role="pw"]');
    const cwV = root.querySelector('[data-role="cw-v"]');
    const pwV = root.querySelector('[data-role="pw-v"]');

    function syncWidthVals() {
      cwV.textContent = String(STATE.settings.chatWidth);
      pwV.textContent = String(STATE.settings.promptWidth);
    }

    cw.value = String(STATE.settings.chatWidth);
    pw.value = String(STATE.settings.promptWidth);
    syncWidthVals();

    cw.addEventListener('input', () => {
      STATE.settings.chatWidth = parseInt(cw.value, 10);
      if (STATE.settings.syncPromptWidth) {
        STATE.settings.promptWidth = STATE.settings.chatWidth;
        pw.value = String(STATE.settings.promptWidth);
      }
      CORE_TP_saveSettings();
      DOM_TP_applySettings();
      syncWidthVals();
    });

    pw.addEventListener('input', () => {
      STATE.settings.promptWidth = parseInt(pw.value, 10);
      STATE.settings.syncPromptWidth = false;
      CORE_TP_saveSettings();
      DOM_TP_applySettings();
      syncWidthVals();

      const elSync = root.querySelector('[data-role="sync-prompt"]');
      if (elSync) elSync.setAttribute(ATTR_CGXUI_STATE, STATE.settings.syncPromptWidth ? 'on' : '');
    });

    function mapSwitch(role, key) {
      const el = root.querySelector(`[data-role="${role}"]`);
      if (!el) return;
      el.setAttribute(ATTR_CGXUI_STATE, STATE.settings[key] ? 'on' : '');

      el.addEventListener('click', () => {
        STATE.settings[key] = !STATE.settings[key];

        if (role === 'sync-prompt' && STATE.settings[key]) {
          STATE.settings.promptWidth = STATE.settings.chatWidth;
          pw.value = String(STATE.settings.promptWidth);
        }

        CORE_TP_saveSettings();
        DOM_TP_applySettings();
        el.setAttribute(ATTR_CGXUI_STATE, STATE.settings[key] ? 'on' : '');

        if (role === 'sync-prompt' || role === 'chat-full') syncWidthVals();
      });
    }

    mapSwitch('hide-header', 'hideHeader');
    mapSwitch('hide-footer', 'hideFooter');
    mapSwitch('expand-chatbox', 'expandChatbox');
    mapSwitch('chat-full', 'chatFullWidth');
    mapSwitch('sync-prompt', 'syncPromptWidth');

    const scrollCards = root.querySelectorAll('[data-scroll]');
    scrollCards.forEach(c => {
      const v = c.dataset.scroll;
      c.setAttribute(ATTR_CGXUI_STATE, v === STATE.settings.scrollAlign ? 'on' : '');
      c.addEventListener('click', () => {
        STATE.settings.scrollAlign = v;
        CORE_TP_saveSettings();
        DOM_TP_applySettings();
        scrollCards.forEach(x => x.setAttribute(ATTR_CGXUI_STATE, (x === c) ? 'on' : ''));
      });
    });
  }

  function UI_TP_dockOptions(items, selected) {
    return items.map((item) => {
      const key = UTIL_escapeHtml(item.key);
      const name = UTIL_escapeHtml(item.name);
      const isSelected = item.key === selected ? ' selected' : '';
      return `<option value="${key}"${isSelected}>${name}</option>`;
    }).join('');
  }

  function UI_TP_dockSelectRow(key, label, value, items, hint = '') {
    return `
      <label class="cgxui-${SkID}-dockrow">
        <span class="cgxui-${SkID}-docklab">${UTIL_escapeHtml(label)}${hint ? `<span class="cgxui-${SkID}-dockhint">${UTIL_escapeHtml(hint)}</span>` : ''}</span>
        <select class="cgxui-${SkID}-docksel" data-ho-dock-select="${UTIL_escapeHtml(key)}">
          ${UI_TP_dockOptions(items, value)}
        </select>
      </label>
    `;
  }

  function UI_TP_dockRangeRow(key, label, value, min, max, step, unit) {
    const safeKey = UTIL_escapeHtml(key);
    const safeUnit = UTIL_escapeHtml(unit || '');
    return `
      <label class="cgxui-${SkID}-dockrow">
        <span class="cgxui-${SkID}-docklab">${UTIL_escapeHtml(label)}</span>
        <span class="cgxui-${SkID}-dockrange">
          <input type="range" min="${min}" max="${max}" step="${step}" value="${UTIL_escapeHtml(value)}" data-ho-dock-range="${safeKey}">
          <span class="cgxui-${SkID}-dockval" data-ho-dock-value="${safeKey}">${UTIL_escapeHtml(value)}${safeUnit}</span>
        </span>
      </label>
    `;
  }

  function UI_TP_dockToggleRow(key, label, value, hint = '') {
    return `
      <div class="cgxui-${SkID}-dockrow">
        <span class="cgxui-${SkID}-docklab">${UTIL_escapeHtml(label)}${hint ? `<span class="cgxui-${SkID}-dockhint">${UTIL_escapeHtml(hint)}</span>` : ''}</span>
        <button type="button" class="cgxui-${SkID}-dockbtn" data-ho-dock-toggle="${UTIL_escapeHtml(key)}" aria-pressed="${value ? 'true' : 'false'}">${value ? 'On' : 'Off'}</button>
      </div>
    `;
  }

  function UI_TP_syncDockRange(root, key, value, unit = '') {
    const input = root?.querySelector?.(`[data-ho-dock-range="${key}"]`);
    const out = root?.querySelector?.(`[data-ho-dock-value="${key}"]`);
    if (input) input.value = String(value);
    if (out) out.textContent = `${value}${unit}`;
  }

  function UI_TP_syncDockToggle(root, key, value) {
    const btn = root?.querySelector?.(`[data-ho-dock-toggle="${key}"]`);
    if (!btn) return;
    btn.setAttribute('aria-pressed', value ? 'true' : 'false');
    btn.textContent = value ? 'On' : 'Off';
  }

  function UI_TP_refreshDockDynamicValues(root, settings) {
    const S = settings || STATE.settings || DEFAULT_SETTINGS;
    UI_TP_syncDockRange(root, 'fontSize', S.fontSize, 'px');
    UI_TP_syncDockRange(root, 'lineHeight', S.lineHeight, 'px');
    UI_TP_syncDockRange(root, 'letterSpace', S.letterSpace, 'px');
    UI_TP_syncDockRange(root, 'chatWidth', S.chatWidth, 'rem');
    UI_TP_syncDockRange(root, 'promptWidth', S.promptWidth, 'rem');
    UI_TP_syncDockToggle(root, 'enabled', S.enabled !== false);
    UI_TP_syncDockToggle(root, 'hideHeader', !!S.hideHeader);
    UI_TP_syncDockToggle(root, 'hideFooter', !!S.hideFooter);
    UI_TP_syncDockToggle(root, 'expandChatbox', !!S.expandChatbox);
    UI_TP_syncDockToggle(root, 'chatFullWidth', !!S.chatFullWidth);
    UI_TP_syncDockToggle(root, 'syncPromptWidth', S.syncPromptWidth !== false);
  }

  function UI_TP_renderDockTab(ctx = {}) {
    const root = ctx.listEl;
    if (!root) return;
    if (!STATE.settings) STATE.settings = CORE_TP_loadSettings();
    const S = STATE.settings;

    root.innerHTML = `
      <div class="cgxui-${SkID}-docktab" data-cgxui="${SkID}-docktab" data-cgxui-owner="${SkID}">
        <section class="cgxui-${SkID}-docksec">
          <h3 class="cgxui-${SkID}-dockttl">Theme</h3>
          ${UI_TP_dockToggleRow('enabled', 'GPThemes Enabled', S.enabled !== false)}
          ${UI_TP_dockSelectRow('mode', 'Mode', CORE_TP_normalizeMode(S.mode), MODE_PRESETS)}
          ${UI_TP_dockSelectRow('themePreset', 'Theme', CORE_TP_normalizeThemePreset(S.themePreset), THEME_PRESETS)}
          ${UI_TP_dockSelectRow('nativeAccent', 'Accent', CORE_TP_normalizeNativeAccent(S.nativeAccent), NATIVE_ACCENT_PRESETS)}
        </section>

        <section class="cgxui-${SkID}-docksec">
          <h3 class="cgxui-${SkID}-dockttl">Font</h3>
          ${UI_TP_dockSelectRow('fontFamily', 'Font Family', CORE_TP_normalizeFontFamily(S.fontFamily), FONT_PRESETS)}
          ${UI_TP_dockSelectRow('fontScope', 'Font Scope', CORE_TP_normalizeFontScope(S.fontScope), FONT_SCOPE_PRESETS)}
          ${UI_TP_dockRangeRow('fontSize', 'Font Size', S.fontSize, 12, 22, 1, 'px')}
          ${UI_TP_dockRangeRow('lineHeight', 'Line Height', S.lineHeight, 18, 34, 1, 'px')}
          ${UI_TP_dockRangeRow('letterSpace', 'Letter Space', S.letterSpace, -1, 2, 0.1, 'px')}
        </section>

        <section class="cgxui-${SkID}-docksec">
          <h3 class="cgxui-${SkID}-dockttl">Layout</h3>
          ${UI_TP_dockRangeRow('chatWidth', 'Chats Width', S.chatWidth, 40, 70, 1, 'rem')}
          ${UI_TP_dockRangeRow('promptWidth', 'Prompt Width', S.promptWidth, 40, 70, 1, 'rem')}
          ${UI_TP_dockToggleRow('hideHeader', 'Hide Header', !!S.hideHeader)}
          ${UI_TP_dockToggleRow('hideFooter', 'Hide Footer', !!S.hideFooter, 'Safe no-op when no footer target exists.')}
          ${UI_TP_dockToggleRow('expandChatbox', 'Expand Chatbox', !!S.expandChatbox)}
          ${UI_TP_dockToggleRow('chatFullWidth', 'Chat Full Width', !!S.chatFullWidth)}
          ${UI_TP_dockToggleRow('syncPromptWidth', 'Sync Prompt Width', S.syncPromptWidth !== false)}
          ${UI_TP_dockSelectRow('scrollAlign', 'Scrolldown Button Align', S.scrollAlign, [
            { key: 'left', name: 'Left' },
            { key: 'center', name: 'Center' },
            { key: 'right', name: 'Right' },
          ], 'Deferred unless a native scroll button target exists.')}
        </section>

        <div class="cgxui-${SkID}-dockactions">
          <button type="button" class="cgxui-${SkID}-dockbtn" data-ho-dock-action="openPanel">Open Panel</button>
          <button type="button" class="cgxui-${SkID}-dockbtn" data-ho-dock-action="resetAll">Reset All</button>
        </div>
      </div>
    `;

    const shell = root.querySelector(`.cgxui-${SkID}-docktab`);
    const applyPatch = (patch, rerender = false) => {
      const next = API_TP_updateSettings(patch) || STATE.settings || DEFAULT_SETTINGS;
      if (rerender) UI_TP_renderDockTab(ctx);
      else UI_TP_refreshDockDynamicValues(shell, next);
      return next;
    };

    root.querySelectorAll('[data-ho-dock-select]').forEach((el) => {
      el.addEventListener('change', () => {
        const key = el.getAttribute('data-ho-dock-select');
        if (!key) return;
        applyPatch({ [key]: el.value }, true);
      }, true);
    });

    root.querySelectorAll('[data-ho-dock-range]').forEach((el) => {
      el.addEventListener('input', () => {
        const key = el.getAttribute('data-ho-dock-range');
        if (!key) return;
        const precision = key === 'letterSpace' ? 1 : 0;
        const value = CORE_TP_clampNumber(el.value, DEFAULT_SETTINGS[key], Number(el.min), Number(el.max), precision);
        applyPatch({ [key]: value }, false);
      }, true);
    });

    root.querySelectorAll('[data-ho-dock-toggle]').forEach((el) => {
      el.addEventListener('click', () => {
        const key = el.getAttribute('data-ho-dock-toggle');
        if (!key) return;
        const next = el.getAttribute('aria-pressed') !== 'true';
        applyPatch({ [key]: next }, key === 'syncPromptWidth');
      }, true);
    });

    root.querySelector('[data-ho-dock-action="openPanel"]')?.addEventListener('click', () => {
      UI_TP_openPanel();
    }, true);

    root.querySelector('[data-ho-dock-action="resetAll"]')?.addEventListener('click', () => {
      CORE_TP_resetSection('color');
      CORE_TP_resetSection('font');
      CORE_TP_resetSection('layout');
      UI_TP_renderDockTab(ctx);
    }, true);
  }

  function DOCK_TP_getApi() {
    return W.H2O?.DP?.dckpnl?.api || W.H2O?.Dock || W.H2O?.PanelSide || null;
  }

  function DOCK_TP_ensureMenuEntry(panelEl) {
    const menu = panelEl?.querySelector?.('[data-h2o-view-menu="1"]');
    if (!menu || menu.querySelector?.('[data-h2o-set-view="themes"]')) return;
    const template = menu.querySelector('button[data-h2o-set-view]');
    const btn = template ? template.cloneNode(true) : D.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Themes';
    btn.setAttribute('data-h2o-set-view', TINY_RAIL_VIEW_THEMES);
    menu.appendChild(btn);
  }

  function DOCK_TP_registerTab() {
    const Dock = W.H2O?.Dock || W.H2O?.PanelSide || null;
    if (!Dock?.registerTab) return false;
    if (Dock.tabs?.[TINY_RAIL_VIEW_THEMES]?.__h2oThemesTab) {
      STATE.dockTabRegistered = true;
      return true;
    }
    Dock.registerTab(TINY_RAIL_VIEW_THEMES, {
      id: TINY_RAIL_VIEW_THEMES,
      title: 'Themes',
      __h2oThemesTab: true,
      render(ctx = {}) {
        DOCK_TP_ensureMenuEntry(ctx.panelEl);
        UI_TP_renderDockTab(ctx);
      },
    });
    STATE.dockTabRegistered = true;
    return true;
  }

  function DOCK_TP_scheduleRegister() {
    if (STATE.dockTabRegistered || STATE.dockTabTimer) return;
    let tries = 0;
    const tick = () => {
      STATE.dockTabTimer = 0;
      if (DOCK_TP_registerTab()) return;
      tries += 1;
      if (tries > 80) return;
      STATE.dockTabTimer = W.setTimeout(tick, 250);
    };
    tick();
  }

  function DOCK_TP_openThemesTab() {
    DOCK_TP_registerTab();
    const api = DOCK_TP_getApi();
    if (!api?.setView || !api?.open) return false;
    try { api.setView(TINY_RAIL_VIEW_THEMES); } catch { return false; }
    try { api.open(); } catch { return false; }
    try { api.requestRender?.(); } catch {}
    return true;
  }

  function UI_TP_activateRailThemesSurface(ev) {
    if (ev?.__h2oRailHandled) return;
    if (DOCK_TP_openThemesTab()) return;
    UI_TP_togglePanel();
  }

  /* ───────────────────────────── 🟧 BOUNDARIES — Tiny Rail Button 📝🔓💥 ───────────────────────────── */

  const UI_TPANEL_SVG_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 22a10 10 0 1 1 10-10c0 2.2-1.8 4-4 4h-1.5a2.5 2.5 0 0 0 0 5H12z"/>
  <circle cx="7.5" cy="10.5" r="1"/>
  <circle cx="12" cy="8" r="1"/>
  <circle cx="16.5" cy="10.5" r="1"/>
  <circle cx="9" cy="15" r="1"/>
</svg>`.trim();

  function UI_TP_findTinyRailEl() {
    return D.getElementById(CFG_TINY_RAIL_ID) || D.querySelector(SEL_TINY_RAIL);
  }

  function UI_TP_findTinyRailAvatarWrap(rail) {
    const railRect = rail.getBoundingClientRect();
    const bottomZoneTop = railRect.bottom - CFG_TINY_RAIL_BOTTOM_ZONE_PX;

    const candidates = Array.from(rail.querySelectorAll(SEL_TINY_RAIL_IMG))
      .map(img => ({ img, r: img.getBoundingClientRect() }))
      .filter(x => {
        if (x.r.bottom < bottomZoneTop) return false;
        if (x.r.left > railRect.right + 20) return false;
        if (x.r.right < railRect.left - 20) return false;
        if (x.r.width < 14 || x.r.height < 14) return false;
        return true;
      })
      .sort((a, b) => b.r.top - a.r.top);

    const avatarImg = candidates[0]?.img;
    if (!avatarImg) return null;

    const clickable =
      avatarImg.closest('a,button,[role="button"],[data-testid]') ||
      avatarImg.parentElement;

    if (!clickable) return null;

    return clickable.closest('div[data-state]') || clickable;
  }

  function UI_TP_findTinyRailStack(rail, templateWrap, avatarWrap) {
    if (!rail) return null;
    if (avatarWrap?.parentElement && rail.contains(avatarWrap.parentElement)) {
      return avatarWrap.parentElement;
    }
    if (templateWrap?.parentElement && rail.contains(templateWrap.parentElement)) {
      return templateWrap.parentElement;
    }
    return (
      rail.querySelector(SEL_TINY_RAIL_STACK_PRIMARY) ||
      rail.querySelector(SEL_TINY_RAIL_STACK_FALLBACK) ||
      rail
    );
  }

  function UI_TP_ensureTinyRailButton() {
    const rail = UI_TP_findTinyRailEl();
    if (!rail) return;

    const ownedBtnSel = DOM_selScoped(UI_TPANEL_TINY_RAIL);
    const rr = rail.getBoundingClientRect();
    if (rr.width < CFG_TINY_RAIL_MIN_W || rr.height < CFG_TINY_RAIL_MIN_H) return;

    const templateWrap =
      rail.querySelector?.(`div[data-state]:not([${ATTR_CGXUI_OWNER}="${SkID}"])`) ||
      rail.querySelector?.('div[data-state]') ||
      rail.querySelector?.(':scope > div') ||
      null;
    const templateA =
      templateWrap?.querySelector?.(SEL_TINY_RAIL_TEMPLATE_A) ||
      rail.querySelector?.(SEL_TINY_RAIL_TEMPLATE_A) ||
      null;
    const templateIconHost = templateA?.querySelector?.(SEL_TINY_RAIL_ICON_HOST) || templateA || null;
    const iconR = templateIconHost?.getBoundingClientRect?.() || null;
    const railW = Math.max(18, Math.round(iconR?.width || CFG_TINY_BTN_W));
    const railH = Math.max(18, Math.round(iconR?.height || CFG_TINY_BTN_H));

    const avatarWrap = UI_TP_findTinyRailAvatarWrap(rail);
    const stack = UI_TP_findTinyRailStack(rail, templateWrap, avatarWrap);
    if (!stack) return;

    let wrap = STATE.tinyRailWrap;
    let btn = wrap?.querySelector?.(ownedBtnSel) || null;
    const needsNew = !wrap || !wrap.isConnected || !btn || !btn.isConnected;
    if (needsNew) {
      wrap = templateWrap ? templateWrap.cloneNode(true) : document.createElement('div');
      wrap.setAttribute('data-state', wrap.getAttribute('data-state') || 'closed');
      wrap.setAttribute(ATTR_CGXUI_OWNER, SkID);
      wrap.setAttribute(ATTR_TINY_RAIL_VIEW, TINY_RAIL_VIEW_THEMES);

      btn = templateA ? templateA.cloneNode(true) : document.createElement('a');
      wrap.textContent = '';
      wrap.appendChild(btn);

      try { btn.removeAttribute('href'); } catch {}
      try { btn.removeAttribute('data-testid'); } catch {}
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('data-sidebar-item', 'true');
      btn.setAttribute('aria-label', 'Themes');
      btn.setAttribute(ATTR_TITLE, CFG_TINY_RAIL_TTL);

      // Contract UI hooks (so Control Hub can discover & manage the button)
      btn.setAttribute(ATTR_CGXUI, UI_TPANEL_TINY_RAIL);
      btn.setAttribute(ATTR_CGXUI_OWNER, SkID);
      btn.setAttribute(ATTR_OWNER, SkID);
      btn.setAttribute(ATTR_TINY_RAIL_VIEW, TINY_RAIL_VIEW_THEMES);

      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        UI_TP_activateRailThemesSurface(ev);
      }, true);

      btn.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        ev.stopPropagation();
        UI_TP_activateRailThemesSurface(ev);
      }, true);

      const stop = (ev) => {
        try { ev.preventDefault(); } catch {}
        try { ev.stopPropagation(); } catch {}
      };
      btn.addEventListener('pointerdown', stop, true);
      btn.addEventListener('mousedown', stop, true);

      STATE.tinyRailWrap = wrap;

      // One-time wiring: react to viewport shifts that can reflow rail internals.
      if (!STATE._tinyRailPosWired) {
        STATE._tinyRailPosWired = true;

        const raf = (fn) => requestAnimationFrame(fn);
        let queued = false;

        const schedule = () => {
          if (queued) return;
          queued = true;
          raf(() => {
            queued = false;
            try { UI_TP_ensureTinyRailButton(); } catch (_) {}
          });
        };

        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule, { passive: true });

        if (window.visualViewport) {
          window.visualViewport.addEventListener('resize', schedule, { passive: true });
          window.visualViewport.addEventListener('scroll', schedule, { passive: true });
        }
      }
    }

    wrap.setAttribute(ATTR_TINY_RAIL_VIEW, TINY_RAIL_VIEW_THEMES);
    wrap.style.position = '';
    wrap.style.zIndex = '';
    wrap.style.pointerEvents = '';
    wrap.style.width = '';
    wrap.style.height = '';
    wrap.style.left = '';
    wrap.style.top = '';

    btn.setAttribute(ATTR_TINY_RAIL_VIEW, TINY_RAIL_VIEW_THEMES);
    btn.setAttribute(ATTR_TITLE, CFG_TINY_RAIL_TTL);
    btn.setAttribute('aria-label', 'Themes');
    btn.style.cursor = 'pointer';

    const iconHost = btn.querySelector(SEL_TINY_RAIL_ICON_HOST) || btn;
    iconHost.style.display = 'flex';
    iconHost.style.alignItems = 'center';
    iconHost.style.justifyContent = 'center';
    iconHost.innerHTML = `
      <span class="${CLS_DOCK_RAIL_NAV_BTN}" aria-hidden="true"
        style="--cgxui-btn-bg:#6b7280; --cgxui-rail-btn-w:${railW}px; --cgxui-rail-btn-h:${railH}px;">
        <span class="${CLS_DOCK_RAIL_NAV_TXT}" aria-hidden="true">${UI_TPANEL_SVG_ICON}</span>
      </span>
    `;

    const parent = avatarWrap?.parentElement && rail.contains(avatarWrap.parentElement)
      ? avatarWrap.parentElement
      : stack;

    if (avatarWrap && avatarWrap !== wrap && avatarWrap.parentElement === parent) {
      if (wrap.parentElement !== parent || wrap.nextSibling !== avatarWrap) {
        parent.insertBefore(wrap, avatarWrap);
      }
    } else if (wrap.parentElement !== parent) {
      parent.appendChild(wrap);
    }
  }

  function UI_TP_wireTinyRailEnsure() {
    if (STATE.moTinyRail) return;

    TIME_TP_scheduleEnsureTinyRail();

    STATE.moTinyRail = new MutationObserver(TIME_TP_scheduleEnsureTinyRail);
    STATE.moTinyRail.observe(D.documentElement, { childList: true, subtree: true });

    STATE.onResize = TIME_TP_scheduleEnsureTinyRail;
    STATE.onPop = TIME_TP_scheduleEnsureTinyRail;

    W.addEventListener(EV_WIN_RESIZE, STATE.onResize, { passive: true });
    W.addEventListener(EV_WIN_POP, STATE.onPop, { passive: true });
    W.addEventListener(EV_LEGACY_NAVIGATE, TIME_TP_scheduleEnsureTinyRail, { passive: true });
  }

  function UI_TP_unwireTinyRailEnsure() {
    try { if (STATE.moTinyRail) STATE.moTinyRail.disconnect(); } catch {}
    STATE.moTinyRail = null;

    try { if (STATE.onResize) W.removeEventListener(EV_WIN_RESIZE, STATE.onResize); } catch {}
    try { if (STATE.onPop) W.removeEventListener(EV_WIN_POP, STATE.onPop); } catch {}
    try { W.removeEventListener(EV_LEGACY_NAVIGATE, TIME_TP_scheduleEnsureTinyRail); } catch {}

    STATE.onResize = null;
    STATE.onPop = null;

    if (STATE.rafTinyRail) W.cancelAnimationFrame(STATE.rafTinyRail);
    STATE.rafTinyRail = 0;

    try {
      const wrap = STATE.tinyRailWrap;
      if (wrap?.parentElement) wrap.parentElement.removeChild(wrap);
    } catch {}
    STATE.tinyRailWrap = null;
  }

  /* ───────────────────────────── ⚫️ LIFECYCLE — INIT / WIRING 📝🔓💥 ───────────────────────────── */

  // H2O vault (Brain boundary-only use of BrID)
  const H2O = (W.H2O = W.H2O || {});
  const MOD_OBJ = ((H2O[TOK] = H2O[TOK] || {})[BrID] = (H2O[TOK][BrID] || {}));

  // bounded diag (Stage-1 minimal)
  MOD_OBJ.diag = MOD_OBJ.diag || { t0: performance.now(), steps: [], errors: [], bufMax: 160, errMax: 30 };

  function API_TP_installPublicApi() {
    const existingApi = MOD_OBJ.api && typeof MOD_OBJ.api === 'object' ? MOD_OBJ.api : null;
    const api = existingApi && Object.isExtensible(existingApi) ? existingApi : {};

    try { MOD_OBJ.api = api; } catch {}

    try { api.version = API_VERSION; } catch {}
    try { api.build = API_BUILD; } catch {}
    try { api.phase = API_PHASE; } catch {}
    try { api.open = UI_TP_openPanel; } catch {}
    try { api.close = UI_TP_closePanel; } catch {}
    try { api.toggle = UI_TP_togglePanel; } catch {}
    try { api.getSettings = API_TP_getSettings; } catch {}
    try { api.updateSettings = API_TP_updateSettings; } catch {}
    try { api.setMode = API_TP_setMode; } catch {}
    try { api.setThemePreset = API_TP_setThemePreset; } catch {}
    try { api.setNativeAccent = API_TP_setNativeAccent; } catch {}
    try { api.listThemePresets = API_TP_listThemePresets; } catch {}
    try { api.listNativeAccents = API_TP_listNativeAccents; } catch {}
    try { api.listFontPresets = API_TP_listFontPresets; } catch {}
    try { api.listFontScopes = API_TP_listFontScopes; } catch {}
    try { api.debugResolveTargets = API_TP_debugResolveTargets; } catch {}

    try { MOD_OBJ.version = API_VERSION; } catch {}
    try { MOD_OBJ.build = API_BUILD; } catch {}
    try { MOD_OBJ.phase = API_PHASE; } catch {}
    try { MOD_OBJ.debugResolveTargets = API_TP_debugResolveTargets; } catch {}

    try {
      MOD_OBJ.diag.version = API_VERSION;
      MOD_OBJ.diag.build = API_BUILD;
      MOD_OBJ.diag.phase = API_PHASE;
      MOD_OBJ.diag.debugResolveTargets = API_TP_debugResolveTargets;
    } catch {}
  }

  API_TP_installPublicApi();

  function CORE_TP_boot() {
    if (STATE.booted && !STATE.disposed) return;
    STATE.disposed = false;
    STATE.booted = true;

    API_TP_installPublicApi();

    STATE.settings = CORE_TP_loadSettings();
    DOM_TP_applySettings();
    DOM_TP_deferChatTargetResolve();
    NATIVE_bootSyncObserver();
    NATIVE_scheduleSync();
    NATIVE_scheduleApply();

    UI_TP_wireTinyRailEnsure();
    DOCK_TP_scheduleRegister();

    API_TP_installPublicApi();
  }

  function CORE_TP_dispose() {
    if (STATE.disposed) return;
    STATE.disposed = true;

    try { STATE.nativeSyncObserver?.disconnect?.(); } catch {}
    STATE.nativeSyncObserver = null;
    if (STATE.nativeSyncTimer) W.clearTimeout(STATE.nativeSyncTimer);
    if (STATE.nativeApplyTimer) W.clearTimeout(STATE.nativeApplyTimer);
    STATE.nativeSyncTimer = 0;
    STATE.nativeApplyTimer = 0;
    STATE.pendingHtmlMutation = null;
    STATE.htmlMutationScheduled = false;
    DOM_TP_unwireSidebarMoreGuard();
    DOM_TP_clearChatTargetMarks();

    UI_TP_unwireTinyRailEnsure();
    UI_TP_closePanel();
  }

  /* ───────────────────────────── ⚪️ LIFECYCLE — STARTUP 📝🔓💥 ───────────────────────────── */

  try {
    if (D.readyState === 'complete' || D.readyState === 'interactive') CORE_TP_boot();
    else W.addEventListener(EV_DOM_READY, CORE_TP_boot, { once: true });
  } catch (e) {
    try {
      MOD_OBJ.diag.errors.push(String(e?.stack || e));
      if (MOD_OBJ.diag.errors.length > MOD_OBJ.diag.errMax) MOD_OBJ.diag.errors.shift();
    } catch {}
  }

  MOD_OBJ.dispose = CORE_TP_dispose;

})();
