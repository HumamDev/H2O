// ==UserScript==
// @h2o-id      8a.themes.panel
// @name         8A.🟪🎨 Themes Panel 🎨
// @namespace    H2O.ChatGPT.Themes
// @version      2.1.14
// @rev        000001
// @build      2026-02-28T17:33:34Z
// @description  Theme button next to Save/Panel/Control that opens a full GPThemes-style customization panel (Color / Font / Layout) for ChatGPT. Contract v2 Stage-1 aligned + legacy settings migration + Tiny Rail button.
// @author       HumamDev
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

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
  const ATTR_HO_CHAT_FULL        = 'data-ho-chat-full';
  const ATTR_HO_SYNC_PROMPT      = 'data-ho-sync-prompt';
  const ATTR_HO_HIDE_HEADER      = 'data-ho-hide-header';
  const ATTR_HO_HIDE_FOOTER      = 'data-ho-hide-footer';
  const ATTR_HO_EXPAND_CHATBOX   = 'data-ho-expand-chatbox';
  const ATTR_HO_BUBBLE_USER      = 'data-ho-bubble-user';
  const ATTR_HO_BUBBLE_GPT       = 'data-ho-bubble-gpt';
  const ATTR_HO_ACCENT_USER_BUBL = 'data-ho-accent-user-bubble';
  const ATTR_HO_SCROLL_ALIGN     = 'data-ho-scroll-align';

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

  /* [CSS][ThemesP] Style id — MUST be cgxui-<skid>-style */
  const CSS_TPANEL_STYLE_ID = `cgxui-${SkID}-style`;

  /* [SEL][ThemesP] Selector registry (NO ad-hoc selector strings elsewhere) */
  const SEL_SEND_BTN =
    'button[data-testid="send-button"], button[aria-label="Send message"]';

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
      document.documentElement.appendChild(host);
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

  /* ───────────────────────────── 🔴 STATE — REGISTRIES / CACHES 📄🔓💧 ───────────────────────────── */

  const STATE = {
    settings: null,

    panelBackdrop: null,
    panelEl: null,
    outsideHandler: null,

    booted: false,
    disposed: false,

    // tiny rail wiring
    moTinyRail: null,
    rafTinyRail: 0,
    onResize: null,
    onPop: null,
    tinyRailWrap: null,
  };

  /* ───────────────────────────── 🟥 ENGINE — DOMAIN LOGIC / PIPELINE 📝🔓💥 ───────────────────────────── */

  const ACCENT_PRESETS = [
    { key: 'lavender', name: 'Lavender', light: '260, 55%, 78%', dark: '260, 45%, 62%' },
    { key: 'coral',    name: 'Coral',    light: '12, 70%, 72%',  dark: '12, 60%, 55%' },
    { key: 'aqua',     name: 'Aqua',     light: '188, 55%, 70%', dark: '188, 50%, 50%' },
    { key: 'emerald',  name: 'Emerald',  light: '152, 45%, 68%', dark: '152, 40%, 48%' },
    { key: 'amber',    name: 'Amber',    light: '40, 70%, 72%',  dark: '36, 65%, 52%' },
    { key: 'rose',     name: 'Rose',     light: '338, 60%, 72%', dark: '338, 52%, 54%' },
    { key: 'slate',    name: 'Slate',    light: '220, 18%, 70%', dark: '220, 18%, 46%' },
  ];

  const DEFAULT_SETTINGS = {
    enabled: true,
    mode: 'dark', // 'light' | 'dark' | 'oled'

    accentLight: '270, 80%, 75%',
    accentDark:  '265, 70%, 62%',
    accentUserBubble: false,

    fontFamily: 'system', // 'system' | 'inter' | 'mono'
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
    bubblesGpt:  true,

    scrollAlign: 'right',
  };

  function CORE_TP_loadSettings() {
    const diskObj = UTIL_storage.getJSON(KEY_TPANEL_UI_SETTINGS_V2, null);
    if (diskObj && typeof diskObj === 'object') return { ...DEFAULT_SETTINGS, ...diskObj };

    const legacyObj = UTIL_storage.getJSON(KEY_TPANEL_LEGACY_SETTINGS, null);
    if (legacyObj && typeof legacyObj === 'object') {
      const merged = { ...DEFAULT_SETTINGS, ...legacyObj };
      UTIL_storage.setJSON(KEY_TPANEL_UI_SETTINGS_V2, merged);
      return merged;
    }
    return { ...DEFAULT_SETTINGS };
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
      S.accentLight = DEFAULT_SETTINGS.accentLight;
      S.accentDark = DEFAULT_SETTINGS.accentDark;
      S.accentUserBubble = DEFAULT_SETTINGS.accentUserBubble;
    } else if (section === 'font') {
      S.fontFamily = DEFAULT_SETTINGS.fontFamily;
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

  /* ───────────────────────────── 🟧 BOUNDARIES — DOM / IO ADAPTERS 📝🔓💥 ───────────────────────────── */

  // cgxui scoped selector helper (owned only)
  function DOM_selScoped(uiToken) {
    return `[${ATTR_CGXUI}="${uiToken}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;
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

  function DOM_TP_applySettings() {
    DOM_TP_ensureStyle();
    const S = STATE.settings;

    if (!S.enabled) {
      D.body.removeAttribute(ATTR_HO_THEME_ENABLED);
      D.documentElement.removeAttribute(ATTR_HO_MODE);

      const el = D.documentElement.style;
      el.removeProperty('--ho-accent-light-hsl');
      el.removeProperty('--ho-accent-dark-hsl');
      el.removeProperty('--ho-font-size');
      el.removeProperty('--ho-line-height');
      el.removeProperty('--ho-letter-space');
      el.removeProperty('--ho-chat-width-rem');
      el.removeProperty('--ho-prompt-width-rem');

      D.body.removeAttribute(ATTR_HO_FONT);
      return;
    }

    D.body.setAttribute(ATTR_HO_THEME_ENABLED, 'true');
    D.documentElement.setAttribute(ATTR_HO_MODE, S.mode);

    D.documentElement.style.setProperty('--ho-accent-light-hsl', S.accentLight);
    D.documentElement.style.setProperty('--ho-accent-dark-hsl',  S.accentDark);

    let fontFlag = S.fontFamily;
    if (!['system', 'inter', 'mono'].includes(fontFlag)) fontFlag = 'system';
    D.body.setAttribute(ATTR_HO_FONT, fontFlag);

    D.documentElement.style.setProperty('--ho-font-size', `${S.fontSize}px`);
    D.documentElement.style.setProperty('--ho-line-height', `${S.lineHeight}px`);
    D.documentElement.style.setProperty('--ho-letter-space', `${S.letterSpace}px`);
    D.documentElement.style.setProperty('--ho-chat-width-rem', `${S.chatWidth}rem`);
    D.documentElement.style.setProperty('--ho-prompt-width-rem', `${S.promptWidth}rem`);

    D.body.setAttribute(ATTR_HO_CHAT_FULL, String(S.chatFullWidth));
    D.body.setAttribute(ATTR_HO_SYNC_PROMPT, String(S.syncPromptWidth));
    D.body.setAttribute(ATTR_HO_HIDE_HEADER, String(S.hideHeader));
    D.body.setAttribute(ATTR_HO_HIDE_FOOTER, String(S.hideFooter));
    D.body.setAttribute(ATTR_HO_EXPAND_CHATBOX, String(S.expandChatbox));
    D.body.setAttribute(ATTR_HO_BUBBLE_USER, String(S.bubblesUser));
    D.body.setAttribute(ATTR_HO_BUBBLE_GPT, String(S.bubblesGpt));
    D.body.setAttribute(ATTR_HO_ACCENT_USER_BUBL, String(S.accentUserBubble));
    D.body.setAttribute(ATTR_HO_SCROLL_ALIGN, S.scrollAlign);
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

/* global background based on accent */
body[${ATTR_HO_THEME_ENABLED}="true"] {
  font-size: var(--ho-font-size);
  line-height: var(--ho-line-height);
  letter-spacing: var(--ho-letter-space);
  background:
    radial-gradient(circle at top left, color-mix(in srgb, #020617 70%, var(--ho-accent-dark) 30%), transparent 60%),
    #020617;
}

/* cards / panels tinted (only when theme enabled) */
body[${ATTR_HO_THEME_ENABLED}="true"] main,
body[${ATTR_HO_THEME_ENABLED}="true"] header,
body[${ATTR_HO_THEME_ENABLED}="true"] nav,
body[${ATTR_HO_THEME_ENABLED}="true"] aside,
body[${ATTR_HO_THEME_ENABLED}="true"] [data-testid="sidebar"] {
  background: transparent;
}
body[${ATTR_HO_THEME_ENABLED}="true"] main > div,
body[${ATTR_HO_THEME_ENABLED}="true"] section,
body[${ATTR_HO_THEME_ENABLED}="true"] article {
  background: color-mix(in srgb, #020617 85%, var(--ho-accent-light) 15%);
}

/* MODE */
html[${ATTR_HO_MODE}="light"]  { color-scheme: light; }
html[${ATTR_HO_MODE}="dark"]   { color-scheme: dark; }
html[${ATTR_HO_MODE}="oled"]   { color-scheme: dark; background-color: #000; }
html[${ATTR_HO_MODE}="oled"] body { background-color: #000; }

/* FONT (family choice) */
body[${ATTR_HO_FONT}="system"] {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
}
body[${ATTR_HO_FONT}="inter"] {
  font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}
body[${ATTR_HO_FONT}="mono"] {
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono","Courier New",monospace;
}

/* ACCENT: send button + toggles */
${SEL_SEND_BTN} {
  background: var(--ho-accent-dark);
  border-color: var(--ho-accent-dark);
  color: #020617;
  transition: filter 120ms ease, transform 80ms ease;
}
${SEL_SEND_BTN}:hover {
  filter: brightness(1.05);
  transform: translateY(-0.5px);
}

/* chat width */
body[${ATTR_HO_THEME_ENABLED}="true"] main {
  max-width: var(--ho-chat-width-rem);
  margin-left: auto;
  margin-right: auto;
}
body[${ATTR_HO_THEME_ENABLED}="true"][${ATTR_HO_CHAT_FULL}="true"] main {
  max-width: 100vw;
}

/* prompt width */
body[${ATTR_HO_THEME_ENABLED}="true"] main form {
  max-width: var(--ho-prompt-width-rem);
  margin-left: auto;
  margin-right: auto;
}
body[${ATTR_HO_THEME_ENABLED}="true"][${ATTR_HO_SYNC_PROMPT}="true"] main form {
  max-width: var(--ho-chat-width-rem);
}

/* header/footer hiding */
body[${ATTR_HO_THEME_ENABLED}="true"][${ATTR_HO_HIDE_HEADER}="true"] header {
  display: none !important;
}
body[${ATTR_HO_THEME_ENABLED}="true"][${ATTR_HO_HIDE_FOOTER}="true"] main footer,
body[${ATTR_HO_THEME_ENABLED}="true"][${ATTR_HO_HIDE_FOOTER}="true"] [data-testid="conversation-input-footer"] {
  display: none !important;
}

/* expand chatbox */
body[${ATTR_HO_THEME_ENABLED}="true"][${ATTR_HO_EXPAND_CHATBOX}="true"] main form textarea {
  min-height: 130px !important;
}

/* chat bubbles */
body[${ATTR_HO_THEME_ENABLED}="true"][${ATTR_HO_BUBBLE_USER}="true"] [data-message-author-role="user"] {
  background: radial-gradient(circle at top left, var(--ho-accent-light), transparent 60%);
  border-radius: 18px;
}
body[${ATTR_HO_THEME_ENABLED}="true"][${ATTR_HO_BUBBLE_GPT}="true"] [data-message-author-role="assistant"] {
  background: radial-gradient(circle at top left, rgba(255,255,255,0.04), transparent 70%);
  border-radius: 18px;
}
body[${ATTR_HO_THEME_ENABLED}="true"][${ATTR_HO_ACCENT_USER_BUBL}="true"] [data-message-author-role="user"] {
  background: var(--ho-accent-dark) !important;
  color: #020617 !important;
  border-radius: 18px !important;
}

/* header/footer tint */
body[${ATTR_HO_THEME_ENABLED}="true"] header {
  background: color-mix(in srgb, #020617 75%, var(--ho-accent-dark) 25%) !important;
  border-bottom: 1px solid color-mix(in srgb, #020617 40%, var(--ho-accent-light) 60%);
}
body[${ATTR_HO_THEME_ENABLED}="true"] footer,
body[${ATTR_HO_THEME_ENABLED}="true"] [data-testid="conversation-input-footer"] {
  background: color-mix(in srgb, #020617 80%, var(--ho-accent-light) 20%) !important;
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
${PANEL} [data-part="hdrrow"] { display:flex; align-items:center; justify-content:space-between; }

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

  function UI_TP_closePanel() {
    if (STATE.outsideHandler) {
      D.removeEventListener('mousedown', STATE.outsideHandler, true);
      STATE.outsideHandler = null;
    }
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
    panel.setAttribute(ATTR_CGXUI_STATE, (STATE.settings.mode === 'light') ? 'light' : 'dark');

    // Build structure (no global classes)
    panel.innerHTML = `
      <div data-part="hdr">
        <div data-part="hdrrow">
          <div data-part="ttl"><span>GPThemes</span> Customization</div>
          <button type="button"
            ${ATTR_CGXUI}="${UI_TPANEL_ENABLE}"
            ${ATTR_CGXUI_OWNER}="${SkID}"
            ></button>
        </div>
      </div>

      <div data-part="tabs">
        <button type="button"
          ${ATTR_CGXUI}="${UI_TPANEL_TABBTN}"
          ${ATTR_CGXUI_OWNER}="${SkID}"
          data-tab="color"
          ${ATTR_CGXUI_STATE}="active"
        >Color</button>

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

    // Position (same behavior)
    const anchor = D.querySelector('header');
    const minLeft = W.scrollX + CFG_PANEL_VP_MARGIN_PX;
    const maxLeft = Math.max(W.scrollX + W.innerWidth - CFG_PANEL_WIDTH_PX - CFG_PANEL_VP_MARGIN_PX, minLeft);
    const centerLeft = W.scrollX + (W.innerWidth - CFG_PANEL_WIDTH_PX) / 2;
    const clampedLeft = Math.min(Math.max(centerLeft, minLeft), maxLeft);

    const topBase = anchor ? (anchor.getBoundingClientRect().bottom + W.scrollY) : W.scrollY + CFG_PANEL_VP_MARGIN_PX;
    const top = Math.max(W.scrollY + CFG_PANEL_VP_MARGIN_PX, topBase + CFG_PANEL_GAP_PX);

    panel.style.left = `${Math.round(clampedLeft)}px`;
    panel.style.top  = `${Math.round(top)}px`;

    // Outside close
    STATE.outsideHandler = (ev) => {
      const t = ev.target;
      if (!STATE.panelEl) return;
      if (STATE.panelEl.contains(t)) return;
      UI_TP_closePanel();
    };
    D.addEventListener('mousedown', STATE.outsideHandler, true);

    const colorPane  = panel.querySelector('[data-pane="color"]');
    const fontPane   = panel.querySelector('[data-pane="font"]');
    const layoutPane = panel.querySelector('[data-pane="layout"]');

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

      panel.setAttribute(ATTR_CGXUI_STATE, (STATE.settings.mode === 'light') ? 'light' : 'dark');
    });

    // Enable toggle
    const toggleBtn = panel.querySelector(DOM_selScoped(UI_TPANEL_ENABLE));
    function refreshEnableBtn() {
      toggleBtn.textContent = STATE.settings.enabled ? 'Theme: ON' : 'Theme: OFF';
      toggleBtn.setAttribute(ATTR_CGXUI_STATE, STATE.settings.enabled ? 'on' : 'off');
    }
    refreshEnableBtn();

    toggleBtn.addEventListener('click', () => {
      STATE.settings.enabled = !STATE.settings.enabled;
      CORE_TP_saveSettings();
      DOM_TP_applySettings();
      refreshEnableBtn();
    });

    UTIL_dispatchEvt(EV_TPANEL_PANEL_OPEN, null);
  }

  /* ───────────────────────────── 🟧 BOUNDARIES — UI PANES 📝🔓💥 ───────────────────────────── */

  function UI_TP_buildColorPane(root) {
    if (!root) return;
    root.innerHTML = '';

    const card = D.createElement('div');
    card.setAttribute('data-part', 'card');
    card.innerHTML = `
      <div data-part="cardttl">Accent</div>
      <div data-part="lbl">Choose an accent pair</div>
      <div data-part="agrid"></div>

      <button type="button" data-part="acustom" data-role="custom-accent">Customize…</button>

      <div data-part="aedit" data-role="custom-editor" hidden>
        <div data-part="arow">
          <div data-part="aprev"></div>
          <div data-part="avals">
            <div data-part="aval">H: <span data-role="h-val"></span>°</div>
            <div data-part="aval">S: <span data-role="s-val"></span>%</div>
            <div data-part="aval">L: <span data-role="l-val"></span>%</div>
          </div>
        </div>

        <label data-part="srow">
          <span>Hue</span>
          <input type="range" min="0" max="360" step="1" data-role="h">
        </label>

        <label data-part="srow">
          <span>Saturation</span>
          <input type="range" min="0" max="100" step="1" data-role="s">
        </label>

        <label data-part="srow">
          <span>Lightness</span>
          <input type="range" min="0" max="100" step="1" data-role="l">
        </label>
      </div>

      <div data-part="swrow">
        <div data-part="swmeta">
          <span>ACCENT USER BUBBLE</span>
          <span>Make the user bubble fully accented for higher contrast</span>
        </div>
        <div data-part="sw" data-role="accent-user"></div>
      </div>
    `;
    root.appendChild(card);

    const modeCard = D.createElement('div');
    modeCard.setAttribute('data-part', 'card');
    modeCard.innerHTML = `
      <div data-part="cardttl">Mode</div>
      <div data-part="fgrid" data-role="mode-grid">
        <div data-part="fcard" data-mode="light"><span>Light</span></div>
        <div data-part="fcard" data-mode="dark"><span>Dark</span></div>
        <div data-part="fcard" data-mode="oled"><span>OLED</span></div>
      </div>
    `;
    root.appendChild(modeCard);

    const grid = card.querySelector('[data-part="agrid"]');
    const currentLight = STATE.settings.accentLight;
    const currentDark  = STATE.settings.accentDark;

    ACCENT_PRESETS.forEach(p => {
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

      const isActive = (p.light === currentLight && p.dark === currentDark);
      if (isActive) item.setAttribute(ATTR_CGXUI_STATE, 'on');

      item.addEventListener('click', () => {
        STATE.settings.accentLight = p.light;
        STATE.settings.accentDark  = p.dark;
        CORE_TP_saveSettings();
        DOM_TP_applySettings();

        Array.from(grid.children).forEach(ch => ch.removeAttribute(ATTR_CGXUI_STATE));
        item.setAttribute(ATTR_CGXUI_STATE, 'on');
        syncSlidersToSettings();
      });

      grid.appendChild(item);
    });

    const customBtn = card.querySelector('[data-role="custom-accent"]');
    const editor    = card.querySelector('[data-role="custom-editor"]');
    const hSlider   = editor.querySelector('input[data-role="h"]');
    const sSlider   = editor.querySelector('input[data-role="s"]');
    const lSlider   = editor.querySelector('input[data-role="l"]');
    const hValSpan  = editor.querySelector('[data-role="h-val"]');
    const sValSpan  = editor.querySelector('[data-role="s-val"]');
    const lValSpan  = editor.querySelector('[data-role="l-val"]');
    const previewEl = editor.querySelector('[data-part="aprev"]');

    function applyCustomFromSliders() {
      const h = Number(hSlider.value);
      const s = Number(sSlider.value);
      const l = Number(lSlider.value);

      hValSpan.textContent = String(h);
      sValSpan.textContent = String(s);
      lValSpan.textContent = String(l);

      previewEl.style.background = `hsl(${h}, ${s}%, ${l}%)`;

      const hStr   = h.toFixed(0);
      const sLight = Math.min(95, s + 5);
      const sDark  = Math.min(95, s + 5);
      const lLight = Math.min(92, l + 10);
      const lDark  = Math.max(25, l - 8);

      STATE.settings.accentLight = `${hStr}, ${sLight.toFixed(0)}%, ${lLight.toFixed(0)}%`;
      STATE.settings.accentDark  = `${hStr}, ${sDark.toFixed(0)}%, ${lDark.toFixed(0)}%`;

      CORE_TP_saveSettings();
      DOM_TP_applySettings();
    }

    function syncSlidersToSettings() {
      const base = UTIL_parseHslString(STATE.settings.accentDark || STATE.settings.accentLight);
      hSlider.value = String(base.h);
      sSlider.value = String(base.s);
      lSlider.value = String(base.l);
      hValSpan.textContent = String(base.h);
      sValSpan.textContent = String(base.s);
      lValSpan.textContent = String(base.l);
      previewEl.style.background = `hsl(${base.h}, ${base.s}%, ${base.l}%)`;
    }

    customBtn.addEventListener('click', () => {
      const open = customBtn.dataset.open === 'true';
      const next = !open;
      customBtn.dataset.open = String(next);
      editor.hidden = !next;
      if (next) syncSlidersToSettings();
    });

    ['input', 'change'].forEach(evt => {
      hSlider.addEventListener(evt, applyCustomFromSliders);
      sSlider.addEventListener(evt, applyCustomFromSliders);
      lSlider.addEventListener(evt, applyCustomFromSliders);
    });

    const accentSwitch = card.querySelector('[data-role="accent-user"]');
    accentSwitch.setAttribute(ATTR_CGXUI_STATE, STATE.settings.accentUserBubble ? 'on' : '');
    accentSwitch.addEventListener('click', () => {
      STATE.settings.accentUserBubble = !STATE.settings.accentUserBubble;
      accentSwitch.setAttribute(ATTR_CGXUI_STATE, STATE.settings.accentUserBubble ? 'on' : '');
      CORE_TP_saveSettings();
      DOM_TP_applySettings();
    });

    const modeCards = modeCard.querySelectorAll('[data-mode]');
    modeCards.forEach(mc => {
      mc.setAttribute(ATTR_CGXUI_STATE, (mc.dataset.mode === STATE.settings.mode) ? 'on' : '');
      mc.addEventListener('click', () => {
        STATE.settings.mode = mc.dataset.mode;
        CORE_TP_saveSettings();
        DOM_TP_applySettings();
        modeCards.forEach(m => m.setAttribute(ATTR_CGXUI_STATE, (m === mc) ? 'on' : ''));
        if (STATE.panelEl) STATE.panelEl.setAttribute(ATTR_CGXUI_STATE, (STATE.settings.mode === 'light') ? 'light' : 'dark');
      });
    });

    syncSlidersToSettings();
  }

  function UI_TP_buildFontPane(root) {
    if (!root) return;
    root.innerHTML = '';

    const card = D.createElement('div');
    card.setAttribute('data-part', 'card');
    card.innerHTML = `
      <div data-part="cardttl">Font Family</div>
      <div data-part="fgrid">
        <div data-part="fcard" data-font="system"><span>Default</span></div>
        <div data-part="fcard" data-font="inter"><span>Inter-like</span></div>
        <div data-part="fcard" data-font="mono"><span>Mono</span></div>
      </div>
    `;
    root.appendChild(card);

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

      <div data-part="swrow">
        <div data-part="swmeta">
          <span>USER BUBBLE</span>
          <span>Toggle stylized bubble for user.</span>
        </div>
        <div data-part="sw" data-role="bubble-user"></div>
      </div>

      <div data-part="swrow">
        <div data-part="swmeta">
          <span>GPT BUBBLE</span>
          <span>Toggle stylized bubble for GPT.</span>
        </div>
        <div data-part="sw" data-role="bubble-gpt"></div>
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
    mapSwitch('bubble-user', 'bubblesUser');
    mapSwitch('bubble-gpt', 'bubblesGpt');

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
        UI_TP_togglePanel();
      }, true);

      btn.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        ev.stopPropagation();
        UI_TP_togglePanel();
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

  function CORE_TP_boot() {
    if (STATE.booted && !STATE.disposed) return;
    STATE.disposed = false;
    STATE.booted = true;

    STATE.settings = CORE_TP_loadSettings();
    DOM_TP_applySettings();

    UI_TP_wireTinyRailEnsure();

    MOD_OBJ.api = MOD_OBJ.api || {};
    MOD_OBJ.api.open = UI_TP_openPanel;
    MOD_OBJ.api.close = UI_TP_closePanel;
    MOD_OBJ.api.toggle = UI_TP_togglePanel;
  }

  function CORE_TP_dispose() {
    if (STATE.disposed) return;
    STATE.disposed = true;

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
