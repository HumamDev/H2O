// ==UserScript==
// @h2o-id             8a2a.h2o.skins.registry
// @name               8A2a.🟪🌸 H2O Skins Registry 🌸
// @namespace          H2O.Premium.CGX.h2o.skins.registry
// @author             HumamDev
// @version            0.2.3
// @revision           004
// @build              260322-173500
// @description        Shared H2O skins registry: root CSS tokens + themed panel primitives for cgxui-owned UI.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* ───────────────────────────── ⬜️ IDENTITY PREFLIGHT ───────────────────────────── */
  const W = window;
  const D = document;

  const TOK = 'SR';
  const PID = 'h2oskins';
  const CID = 'skinsreg';
  const SkID = 'skrg';
  const BrID = PID;
  const DsID = PID;

  const MODTAG = 'SkinsReg';
  const MODICON = '🌸';
  const EMOJI_HDR = '🟪🌸';

  const SUITE = 'prime';
  const HOST = 'chatgpt';

  const PID_UP = PID.toUpperCase();
  const CID_UP = CID.toUpperCase();

  /* ───────────────────────────── ⬛️ CONTRACT CONSTANTS ───────────────────────────── */
  const NS_MEM = `${TOK}:${PID}:guard`;
  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;

  const KEY_GUARD_BOOT = `${NS_MEM}:booted`;
  const KEY_SKIN_ACTIVE_V1 = `${NS_DISK}:skins:active:v1`;

  const EV_SKIN_CHANGED = 'evt:h2o:skins:changed';

  const ATTR_CGXUI = 'data-cgxui';
  const ATTR_CGXUI_OWNER = 'data-cgxui-owner';
  const ATTR_H2O_GLASS = 'data-h2o-glass';
  const ATTR_H2O_TEXT = 'data-h2o-text';
  const ATTR_ROOT_SKIN = 'data-h2o-skin';

  const VAL_GLASS_PANEL = 'panel';
  const VAL_TEXT_MUTE = 'mute';

  const UI_STYLE = `${SkID}-style`;
  const CSS_STYLE_ID = `cgxui-${SkID}-style`;

  const CFG_DIAG_STEPS_MAX = 120;

  const STR_REASON_BOOT = 'boot';
  const STR_REASON_INIT = 'init';
  const STR_REASON_REPLACE = 'replace';
  const STR_REASON_DISPOSE = 'dispose';
  const STR_REASON_API_SET = 'api:set';
  const STR_REASON_INVALID = 'invalid';
  const STR_REASON_BOOT_CRASH = 'boot-crash';

  const STR_SKIN_SAND_GLASS = 'Sand Glass';
  const STR_SKIN_AURORA_GLASS = 'Aurora Glass';
  const STR_SKIN_DARK_MATTE = 'Dark Matte';
  const STR_SKIN_GRAPHITE_AMBER = 'Graphite Amber';
  const STR_SKIN_GRAPHITE_SIGNAL = 'Graphite Signal';
  const STR_SKIN_STEALTH_SIGNAL = 'Stealth Signal';

  /* ───────────────────────────── 🎨 TOKEN KEYS ───────────────────────────── */
  /* Legacy-compatible glass keys */
  const KEY_GLASS_TEXT = 'GLASS_TEXT';
  const KEY_GLASS_TEXT_MUTE = 'GLASS_TEXT_MUTE';
  const KEY_GLASS_BG_A = 'GLASS_BG_A';
  const KEY_GLASS_BG_B = 'GLASS_BG_B';
  const KEY_GLASS_BLUR_PX = 'GLASS_BLUR_PX';
  const KEY_GLASS_SAT = 'GLASS_SAT';
  const KEY_GLASS_CONTRAST = 'GLASS_CONTRAST';
  const KEY_GLASS_BRIGHT = 'GLASS_BRIGHT';
  const KEY_GLASS_BORDER = 'GLASS_BORDER';
  const KEY_GLASS_SHADOW = 'GLASS_SHADOW';
  const KEY_BTN_BG = 'BTN_BG';
  const KEY_BTN_BG_HOVER = 'BTN_BG_HOVER';
  const KEY_BTN_BG_ACTIVE = 'BTN_BG_ACTIVE';
  const KEY_SEL_BG = 'SEL_BG';
  const KEY_SEL_BORDER = 'SEL_BORDER';
  const KEY_FOCUS_RING = 'FOCUS_RING';
  const KEY_SCROLL_THIN = 'SCROLL_THIN';

  /* New generalized panel/control keys */
  const KEY_PANEL_BG = 'PANEL_BG';
  const KEY_PANEL_BORDER = 'PANEL_BORDER';
  const KEY_PANEL_SHADOW = 'PANEL_SHADOW';
  const KEY_PANEL_BACKDROP = 'PANEL_BACKDROP';
  const KEY_PANEL_FILTER = 'PANEL_FILTER';
  const KEY_BTN_BORDER = 'BTN_BORDER';
  const KEY_BTN_BORDER_ACTIVE = 'BTN_BORDER_ACTIVE';
  const KEY_BTN_SHADOW_ACTIVE = 'BTN_SHADOW_ACTIVE';
  const KEY_INPUT_BG = 'INPUT_BG';
  const KEY_INPUT_BORDER = 'INPUT_BORDER';
  const KEY_SCROLLBAR_THUMB = 'SCROLLBAR_THUMB';
  const KEY_SCROLLBAR_THUMB_HOVER = 'SCROLLBAR_THUMB_HOVER';

  const CSS_VAR_GLASS_TEXT = '--h2o-glass-text';
  const CSS_VAR_GLASS_TEXT_MUTE = '--h2o-glass-text-mute';
  const CSS_VAR_GLASS_BG_A = '--h2o-glass-bg-a';
  const CSS_VAR_GLASS_BG_B = '--h2o-glass-bg-b';
  const CSS_VAR_GLASS_BLUR_PX = '--h2o-glass-blur-px';
  const CSS_VAR_GLASS_SAT = '--h2o-glass-sat';
  const CSS_VAR_GLASS_CONTRAST = '--h2o-glass-contrast';
  const CSS_VAR_GLASS_BRIGHT = '--h2o-glass-bright';
  const CSS_VAR_GLASS_BORDER = '--h2o-glass-border';
  const CSS_VAR_GLASS_SHADOW = '--h2o-glass-shadow';
  const CSS_VAR_BTN_BG = '--h2o-btn-bg';
  const CSS_VAR_BTN_BG_HOVER = '--h2o-btn-bg-hover';
  const CSS_VAR_BTN_BG_ACTIVE = '--h2o-btn-bg-active';
  const CSS_VAR_SEL_BG = '--h2o-sel-bg';
  const CSS_VAR_SEL_BORDER = '--h2o-sel-border';
  const CSS_VAR_FOCUS_RING = '--h2o-focus-ring';
  const CSS_VAR_SCROLL_THIN = '--h2o-scroll-thin';

  const CSS_VAR_PANEL_BG = '--h2o-panel-bg';
  const CSS_VAR_PANEL_BORDER = '--h2o-panel-border';
  const CSS_VAR_PANEL_SHADOW = '--h2o-panel-shadow';
  const CSS_VAR_PANEL_BACKDROP = '--h2o-panel-backdrop';
  const CSS_VAR_PANEL_FILTER = '--h2o-panel-filter';
  const CSS_VAR_BTN_BORDER = '--h2o-btn-border';
  const CSS_VAR_BTN_BORDER_ACTIVE = '--h2o-btn-border-active';
  const CSS_VAR_BTN_SHADOW_ACTIVE = '--h2o-btn-shadow-active';
  const CSS_VAR_INPUT_BG = '--h2o-input-bg';
  const CSS_VAR_INPUT_BORDER = '--h2o-input-border';
  const CSS_VAR_SCROLLBAR_THUMB = '--h2o-scrollbar-thumb';
  const CSS_VAR_SCROLLBAR_THUMB_HOVER = '--h2o-scrollbar-thumb-hover';

  const TOKEN_CSS_BINDINGS = Object.freeze([
    [KEY_GLASS_TEXT, CSS_VAR_GLASS_TEXT],
    [KEY_GLASS_TEXT_MUTE, CSS_VAR_GLASS_TEXT_MUTE],
    [KEY_GLASS_BG_A, CSS_VAR_GLASS_BG_A],
    [KEY_GLASS_BG_B, CSS_VAR_GLASS_BG_B],
    [KEY_GLASS_BLUR_PX, CSS_VAR_GLASS_BLUR_PX],
    [KEY_GLASS_SAT, CSS_VAR_GLASS_SAT],
    [KEY_GLASS_CONTRAST, CSS_VAR_GLASS_CONTRAST],
    [KEY_GLASS_BRIGHT, CSS_VAR_GLASS_BRIGHT],
    [KEY_GLASS_BORDER, CSS_VAR_GLASS_BORDER],
    [KEY_GLASS_SHADOW, CSS_VAR_GLASS_SHADOW],
    [KEY_BTN_BG, CSS_VAR_BTN_BG],
    [KEY_BTN_BG_HOVER, CSS_VAR_BTN_BG_HOVER],
    [KEY_BTN_BG_ACTIVE, CSS_VAR_BTN_BG_ACTIVE],
    [KEY_SEL_BG, CSS_VAR_SEL_BG],
    [KEY_SEL_BORDER, CSS_VAR_SEL_BORDER],
    [KEY_FOCUS_RING, CSS_VAR_FOCUS_RING],
    [KEY_SCROLL_THIN, CSS_VAR_SCROLL_THIN],
    [KEY_PANEL_BG, CSS_VAR_PANEL_BG],
    [KEY_PANEL_BORDER, CSS_VAR_PANEL_BORDER],
    [KEY_PANEL_SHADOW, CSS_VAR_PANEL_SHADOW],
    [KEY_PANEL_BACKDROP, CSS_VAR_PANEL_BACKDROP],
    [KEY_PANEL_FILTER, CSS_VAR_PANEL_FILTER],
    [KEY_BTN_BORDER, CSS_VAR_BTN_BORDER],
    [KEY_BTN_BORDER_ACTIVE, CSS_VAR_BTN_BORDER_ACTIVE],
    [KEY_BTN_SHADOW_ACTIVE, CSS_VAR_BTN_SHADOW_ACTIVE],
    [KEY_INPUT_BG, CSS_VAR_INPUT_BG],
    [KEY_INPUT_BORDER, CSS_VAR_INPUT_BORDER],
    [KEY_SCROLLBAR_THUMB, CSS_VAR_SCROLLBAR_THUMB],
    [KEY_SCROLLBAR_THUMB_HOVER, CSS_VAR_SCROLLBAR_THUMB_HOVER],
  ]);

  const SEL_PANEL_ROOT = `[${ATTR_CGXUI_OWNER}][${ATTR_H2O_GLASS}="${VAL_GLASS_PANEL}"]`;
  const SEL_PANEL_CHILD = `[${ATTR_CGXUI_OWNER}] [${ATTR_H2O_GLASS}="${VAL_GLASS_PANEL}"]`;
  const SEL_PANEL = `${SEL_PANEL_ROOT}, ${SEL_PANEL_CHILD}`;
  const SEL_PANEL_BUTTONS = `${SEL_PANEL} button, ${SEL_PANEL} [role="button"], ${SEL_PANEL} [role="tab"]`;
  const SEL_PANEL_INPUTS = `${SEL_PANEL} input, ${SEL_PANEL} textarea, ${SEL_PANEL} select`;
  const SEL_PANEL_INPUT_PLACEHOLDERS = `${SEL_PANEL} input::placeholder, ${SEL_PANEL} textarea::placeholder`;
  const SEL_PANEL_FOCUSABLE = `${SEL_PANEL_BUTTONS}, ${SEL_PANEL_INPUTS}, ${SEL_PANEL} a[href]`;
  const SEL_PANEL_SELECTION = `${SEL_PANEL} ::selection`;
  const SEL_PANEL_TEXT_MUTE = `${SEL_PANEL} [${ATTR_H2O_TEXT}="${VAL_TEXT_MUTE}"]`;
  const SEL_PANEL_SCROLL_SCOPE = `${SEL_PANEL}, ${SEL_PANEL} *`;
  const SEL_PANEL_SCROLLBAR = `${SEL_PANEL}::-webkit-scrollbar, ${SEL_PANEL} *::-webkit-scrollbar`;
  const SEL_PANEL_SCROLLBAR_THUMB = `${SEL_PANEL}::-webkit-scrollbar-thumb, ${SEL_PANEL} *::-webkit-scrollbar-thumb`;
  const SEL_PANEL_SCROLLBAR_TRACK = `${SEL_PANEL}::-webkit-scrollbar-track, ${SEL_PANEL} *::-webkit-scrollbar-track`;

  const KEY_DETAIL_NAME = 'name';
  const KEY_DETAIL_REASON = 'reason';

  const CFG_DEFAULT_SKIN_NAME = STR_SKIN_SAND_GLASS;

  function skinPreset(def) {
    return Object.freeze({
      name: String(def.name || ''),
      aliases: Object.freeze(Array.isArray(def.aliases) ? def.aliases.map((v) => String(v || '').trim()).filter(Boolean) : []),
      tokens: Object.freeze(def.tokens || {}),
    });
  }

  const SKIN_PRESETS = Object.freeze([
    skinPreset({
      name: STR_SKIN_SAND_GLASS,
      tokens: {
        [KEY_GLASS_TEXT]: '#f4f6fb',
        [KEY_GLASS_TEXT_MUTE]: 'rgba(244,246,251,.70)',
        [KEY_GLASS_BG_A]: 'rgba(255,255,255,0.045)',
        [KEY_GLASS_BG_B]: 'rgba(255,255,255,0.030)',
        [KEY_GLASS_BLUR_PX]: 14,
        [KEY_GLASS_SAT]: 1.05,
        [KEY_GLASS_CONTRAST]: 1.08,
        [KEY_GLASS_BRIGHT]: 1.03,
        [KEY_GLASS_BORDER]: 'rgba(255,255,255,.12)',
        [KEY_GLASS_SHADOW]: '0 26px 80px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.10), inset 0 0 0 1px rgba(0,0,0,.25)',
        [KEY_BTN_BG]: 'rgba(255,255,255,.06)',
        [KEY_BTN_BG_HOVER]: 'rgba(255,255,255,.10)',
        [KEY_BTN_BG_ACTIVE]: 'rgba(255,255,255,.14)',
        [KEY_SEL_BG]: 'rgba(147,197,253,.16)',
        [KEY_SEL_BORDER]: 'rgba(147,197,253,.30)',
        [KEY_FOCUS_RING]: 'rgba(147,197,253,.40)',
        [KEY_SCROLL_THIN]: true,
        [KEY_PANEL_BG]: 'linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.030))',
        [KEY_PANEL_BORDER]: 'rgba(255,255,255,.12)',
        [KEY_PANEL_SHADOW]: '0 26px 80px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.10), inset 0 0 0 1px rgba(0,0,0,.25)',
        [KEY_PANEL_BACKDROP]: 'blur(14px) saturate(1.05) contrast(1.08) brightness(1.03)',
        [KEY_PANEL_FILTER]: 'none',
        [KEY_BTN_BORDER]: 'rgba(255,255,255,.10)',
        [KEY_BTN_BORDER_ACTIVE]: 'rgba(147,197,253,.30)',
        [KEY_BTN_SHADOW_ACTIVE]: '0 0 0 1px rgba(147,197,253,.30), 0 10px 30px rgba(0,0,0,.35)',
        [KEY_INPUT_BG]: 'rgba(0,0,0,.22)',
        [KEY_INPUT_BORDER]: 'rgba(255,255,255,.12)',
        [KEY_SCROLLBAR_THUMB]: 'rgba(255,255,255,.16)',
        [KEY_SCROLLBAR_THUMB_HOVER]: 'rgba(255,255,255,.22)',
      },
    }),
    skinPreset({
      name: STR_SKIN_AURORA_GLASS,
      aliases: ['Ice Glass'],
      tokens: {
        [KEY_GLASS_TEXT]: '#f4f6fb',
        [KEY_GLASS_TEXT_MUTE]: 'rgba(244,246,251,.72)',
        [KEY_GLASS_BG_A]: 'rgba(10, 10, 14, 0.90)',
        [KEY_GLASS_BG_B]: 'rgba(18, 18, 22, 0.86)',
        [KEY_GLASS_BLUR_PX]: 14,
        [KEY_GLASS_SAT]: 1.2,
        [KEY_GLASS_CONTRAST]: 1.0,
        [KEY_GLASS_BRIGHT]: 1.0,
        [KEY_GLASS_BORDER]: 'rgba(255,255,255,.08)',
        [KEY_GLASS_SHADOW]: '0 26px 80px rgba(0,0,0,.90), 0 0 0 1px rgba(255,255,255,.05)',
        [KEY_BTN_BG]: 'rgba(255,255,255,0.06)',
        [KEY_BTN_BG_HOVER]: 'rgba(255,255,255,0.10)',
        [KEY_BTN_BG_ACTIVE]: 'rgba(255,255,255,0.14)',
        [KEY_SEL_BG]: 'rgba(56, 189, 248, 0.14)',
        [KEY_SEL_BORDER]: 'rgba(56, 189, 248, 0.25)',
        [KEY_FOCUS_RING]: 'rgba(56,189,248,.40)',
        [KEY_SCROLL_THIN]: true,
        [KEY_PANEL_BG]: 'radial-gradient(circle at 0% 0%, rgba(56, 189, 248, 0.18), transparent 45%), radial-gradient(circle at 100% 100%, rgba(168, 85, 247, 0.14), transparent 55%), linear-gradient(135deg, rgba(10, 10, 14, 0.90), rgba(18, 18, 22, 0.86))',
        [KEY_PANEL_BORDER]: 'rgba(255,255,255,.08)',
        [KEY_PANEL_SHADOW]: '0 26px 80px rgba(0,0,0,.90), 0 0 0 1px rgba(255,255,255,.05)',
        [KEY_PANEL_BACKDROP]: 'blur(14px) saturate(1.2)',
        [KEY_PANEL_FILTER]: 'none',
        [KEY_BTN_BORDER]: 'rgba(255,255,255,.08)',
        [KEY_BTN_BORDER_ACTIVE]: 'rgba(56, 189, 248, 0.25)',
        [KEY_BTN_SHADOW_ACTIVE]: '0 0 0 1px rgba(56, 189, 248, 0.25), 0 10px 30px rgba(0,0,0,.35)',
        [KEY_INPUT_BG]: 'rgba(0,0,0,.20)',
        [KEY_INPUT_BORDER]: 'rgba(255,255,255,.08)',
        [KEY_SCROLLBAR_THUMB]: 'rgba(255,255,255,.16)',
        [KEY_SCROLLBAR_THUMB_HOVER]: 'rgba(255,255,255,.22)',
      },
    }),
    skinPreset({
      name: STR_SKIN_DARK_MATTE,
      aliases: ['Smoke Glass'],
      tokens: {
        [KEY_GLASS_TEXT]: 'rgba(245,245,247,0.94)',
        [KEY_GLASS_TEXT_MUTE]: 'rgba(245,245,247,0.66)',
        [KEY_GLASS_BG_A]: 'rgba(18,18,20,0.98)',
        [KEY_GLASS_BG_B]: 'rgba(22,22,26,0.98)',
        [KEY_GLASS_BLUR_PX]: 0,
        [KEY_GLASS_SAT]: 1,
        [KEY_GLASS_CONTRAST]: 1,
        [KEY_GLASS_BRIGHT]: 1,
        [KEY_GLASS_BORDER]: 'rgba(255,255,255,0.08)',
        [KEY_GLASS_SHADOW]: '0 18px 60px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.05)',
        [KEY_BTN_BG]: 'rgba(255,255,255,0.05)',
        [KEY_BTN_BG_HOVER]: 'rgba(255,255,255,0.09)',
        [KEY_BTN_BG_ACTIVE]: 'rgba(255,255,255,0.12)',
        [KEY_SEL_BG]: 'rgba(99,102,241,0.14)',
        [KEY_SEL_BORDER]: 'rgba(99,102,241,0.28)',
        [KEY_FOCUS_RING]: 'rgba(99,102,241,0.34)',
        [KEY_SCROLL_THIN]: true,
        [KEY_PANEL_BG]: 'linear-gradient(180deg, rgba(18,18,20,0.98), rgba(22,22,26,0.98))',
        [KEY_PANEL_BORDER]: 'rgba(255,255,255,0.08)',
        [KEY_PANEL_SHADOW]: '0 18px 60px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.05)',
        [KEY_PANEL_BACKDROP]: 'none',
        [KEY_PANEL_FILTER]: 'none',
        [KEY_BTN_BORDER]: 'rgba(255,255,255,0.08)',
        [KEY_BTN_BORDER_ACTIVE]: 'rgba(99,102,241,0.28)',
        [KEY_BTN_SHADOW_ACTIVE]: 'inset 0 0 0 1px rgba(0,0,0,.25)',
        [KEY_INPUT_BG]: 'rgba(0,0,0,0.35)',
        [KEY_INPUT_BORDER]: 'rgba(255,255,255,0.08)',
        [KEY_SCROLLBAR_THUMB]: 'rgba(255,255,255,.16)',
        [KEY_SCROLLBAR_THUMB_HOVER]: 'rgba(255,255,255,.22)',
      },
    }),
    skinPreset({
      name: STR_SKIN_GRAPHITE_AMBER,
      tokens: {
        [KEY_GLASS_TEXT]: 'rgba(245,245,245,0.92)',
        [KEY_GLASS_TEXT_MUTE]: 'rgba(245,245,245,0.68)',
        [KEY_GLASS_BG_A]: 'rgba(30,33,40,0.96)',
        [KEY_GLASS_BG_B]: 'rgba(12,13,17,0.95)',
        [KEY_GLASS_BLUR_PX]: 16,
        [KEY_GLASS_SAT]: 1.1,
        [KEY_GLASS_CONTRAST]: 1,
        [KEY_GLASS_BRIGHT]: 1,
        [KEY_GLASS_BORDER]: 'rgba(255,255,255,0.12)',
        [KEY_GLASS_SHADOW]: '0 22px 52px rgba(0,0,0,0.58), 0 10px 20px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.10)',
        [KEY_BTN_BG]: 'linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03))',
        [KEY_BTN_BG_HOVER]: 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.05))',
        [KEY_BTN_BG_ACTIVE]: 'linear-gradient(180deg, rgba(255,215,0,0.18), rgba(255,215,0,0.06))',
        [KEY_SEL_BG]: 'rgba(255,215,0,0.12)',
        [KEY_SEL_BORDER]: 'rgba(255,215,0,0.32)',
        [KEY_FOCUS_RING]: 'rgba(255,215,0,0.22)',
        [KEY_SCROLL_THIN]: true,
        [KEY_PANEL_BG]: 'radial-gradient(180px 90px at 86% -6%, rgba(255,215,0,0.15), rgba(255,215,0,0) 72%), linear-gradient(160deg, rgba(30,33,40,0.96), rgba(12,13,17,0.95))',
        [KEY_PANEL_BORDER]: 'rgba(255,255,255,0.12)',
        [KEY_PANEL_SHADOW]: '0 22px 52px rgba(0,0,0,0.58), 0 10px 20px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.10)',
        [KEY_PANEL_BACKDROP]: 'blur(16px) saturate(1.1)',
        [KEY_PANEL_FILTER]: 'none',
        [KEY_BTN_BORDER]: 'rgba(255,255,255,0.18)',
        [KEY_BTN_BORDER_ACTIVE]: 'rgba(255,215,0,0.40)',
        [KEY_BTN_SHADOW_ACTIVE]: '0 0 0 1px rgba(255,215,0,0.32), 0 8px 18px rgba(255,215,0,0.08)',
        [KEY_INPUT_BG]: 'rgba(255,255,255,0.06)',
        [KEY_INPUT_BORDER]: 'rgba(255,255,255,0.16)',
        [KEY_SCROLLBAR_THUMB]: 'rgba(255,255,255,.16)',
        [KEY_SCROLLBAR_THUMB_HOVER]: 'rgba(255,255,255,.22)',
      },
    }),

    skinPreset({
      name: STR_SKIN_GRAPHITE_SIGNAL,
      tokens: {
        [KEY_GLASS_TEXT]: '#eef2f7',
        [KEY_GLASS_TEXT_MUTE]: 'rgba(238,242,247,.64)',
        [KEY_GLASS_BG_A]: 'rgba(28,31,39,.24)',
        [KEY_GLASS_BG_B]: 'rgba(10,12,16,.18)',
        [KEY_GLASS_BLUR_PX]: 14,
        [KEY_GLASS_SAT]: 1.02,
        [KEY_GLASS_CONTRAST]: 1.08,
        [KEY_GLASS_BRIGHT]: 0.99,
        [KEY_GLASS_BORDER]: 'rgba(255,255,255,.16)',
        [KEY_GLASS_SHADOW]: '0 20px 60px rgba(0,0,0,.72), 0 0 0 1px rgba(255,255,255,.07)',
        [KEY_BTN_BG]: 'rgba(255,255,255,.05)',
        [KEY_BTN_BG_HOVER]: 'rgba(255,255,255,.08)',
        [KEY_BTN_BG_ACTIVE]: 'rgba(255,255,255,.12)',
        [KEY_SEL_BG]: 'rgba(255,215,0,.10)',
        [KEY_SEL_BORDER]: 'rgba(255,215,0,.30)',
        [KEY_FOCUS_RING]: 'rgba(255,215,0,.36)',
        [KEY_SCROLL_THIN]: true,
        [KEY_PANEL_BG]: 'linear-gradient(180deg, rgba(28,31,39,.24), rgba(10,12,16,.18))',
        [KEY_PANEL_BORDER]: 'rgba(255,255,255,.16)',
        [KEY_PANEL_SHADOW]: '0 20px 60px rgba(0,0,0,.72), 0 0 0 1px rgba(255,255,255,.07)',
        [KEY_PANEL_BACKDROP]: 'blur(14px) saturate(1.02) contrast(1.08) brightness(0.99)',
        [KEY_PANEL_FILTER]: 'none',
        [KEY_BTN_BORDER]: 'rgba(255,255,255,.16)',
        [KEY_BTN_BORDER_ACTIVE]: 'rgba(255,215,0,.30)',
        [KEY_BTN_SHADOW_ACTIVE]: '0 0 0 1px rgba(255,215,0,.30), 0 10px 24px rgba(0,0,0,.26)',
        [KEY_INPUT_BG]: 'rgba(10,12,16,.24)',
        [KEY_INPUT_BORDER]: 'rgba(255,255,255,.16)',
        [KEY_SCROLLBAR_THUMB]: 'rgba(255,255,255,.16)',
        [KEY_SCROLLBAR_THUMB_HOVER]: 'rgba(255,255,255,.22)',
      },
    }),

    skinPreset({
      name: STR_SKIN_STEALTH_SIGNAL,
      aliases: ['MiniMap HUD'],
      tokens: {
        [KEY_GLASS_TEXT]: '#e5e7eb',
        [KEY_GLASS_TEXT_MUTE]: 'rgba(229,231,235,.60)',
        [KEY_GLASS_BG_A]: 'rgba(24,27,34,.16)',
        [KEY_GLASS_BG_B]: 'rgba(8,10,14,.10)',
        [KEY_GLASS_BLUR_PX]: 0,
        [KEY_GLASS_SAT]: 1.0,
        [KEY_GLASS_CONTRAST]: 1.02,
        [KEY_GLASS_BRIGHT]: 0.98,
        [KEY_GLASS_BORDER]: 'rgba(255,255,255,.06)',
        [KEY_GLASS_SHADOW]: '0 2px 4px rgba(0,0,0,.20), inset 0 0 2px rgba(255,255,255,.03)',
        [KEY_BTN_BG]: 'rgba(255,255,255,.035)',
        [KEY_BTN_BG_HOVER]: 'rgba(255,255,255,.08)',
        [KEY_BTN_BG_ACTIVE]: 'rgba(255,255,255,.12)',
        [KEY_SEL_BG]: 'rgba(255,215,0,.08)',
        [KEY_SEL_BORDER]: 'rgba(255,215,0,.28)',
        [KEY_FOCUS_RING]: 'rgba(255,215,0,.34)',
        [KEY_SCROLL_THIN]: true,
        [KEY_PANEL_BG]: 'linear-gradient(180deg, rgba(24,27,34,.16), rgba(8,10,14,.10))',
        [KEY_PANEL_BORDER]: 'rgba(255,255,255,.06)',
        [KEY_PANEL_SHADOW]: '0 2px 4px rgba(0,0,0,.20), inset 0 0 2px rgba(255,255,255,.03)',
        [KEY_PANEL_BACKDROP]: 'none',
        [KEY_PANEL_FILTER]: 'none',
        [KEY_BTN_BORDER]: 'rgba(255,255,255,.06)',
        [KEY_BTN_BORDER_ACTIVE]: 'rgba(255,215,0,.28)',
        [KEY_BTN_SHADOW_ACTIVE]: '0 0 6px 2px rgba(255,215,0,.20)',
        [KEY_INPUT_BG]: 'rgba(15,15,15,.90)',
        [KEY_INPUT_BORDER]: 'rgba(255,255,255,.08)',
        [KEY_SCROLLBAR_THUMB]: 'rgba(255,255,255,.24)',
        [KEY_SCROLLBAR_THUMB_HOVER]: 'rgba(255,255,255,.38)',
      },
    }),
  ]);

  const SKIN_NAME_LIST = Object.freeze(SKIN_PRESETS.map((p) => p.name));
  const SKIN_BY_NAME = new Map(SKIN_PRESETS.map((p) => [p.name.toLowerCase(), p]));
  const SKIN_ALIAS_BY_NAME = new Map(
    SKIN_PRESETS.flatMap((p) => (p.aliases || []).map((alias) => [alias.toLowerCase(), p]))
  );

  /* ───────────────────────────── 🟥 H2O VAULT + BOUNDED DIAG ───────────────────────────── */
  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || {};
  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});
  VAULT.meta = VAULT.meta || {
    tok: TOK,
    pid: PID,
    cid: CID_UP,
    skid: SkID,
    modtag: MODTAG,
    modicon: MODICON,
    emoji: EMOJI_HDR,
    suite: SUITE,
    host: HOST,
    pidUp: PID_UP,
  };
  VAULT.diag = VAULT.diag || { t0: performance.now(), steps: [], errors: [], bufMax: CFG_DIAG_STEPS_MAX, errMax: 24 };
  VAULT.state = VAULT.state || { booted: false, activeName: '', styleEl: null, prevGlobalApi: null };

  const DIAG = VAULT.diag;
  const S = VAULT.state;

  function DIAG_step(name, extra) {
    DIAG.steps.push({ t: Date.now(), name: String(name || ''), extra: extra ?? null });
    if (DIAG.steps.length > (Number(DIAG.bufMax) || CFG_DIAG_STEPS_MAX)) DIAG.steps.shift();
  }

  function DIAG_error(where, err) {
    const rec = { t: Date.now(), where: String(where || ''), error: String(err?.stack || err || '') };
    DIAG.errors.push(rec);
    if (DIAG.errors.length > (Number(DIAG.errMax) || 24)) DIAG.errors.shift();
    DIAG.lastError = rec.error;
  }

  function UTIL_safe(fn) {
    try { return fn(); } catch (err) { DIAG_error('UTIL_safe', err); return null; }
  }

  function UTIL_getStr(key, fallback = '') {
    return UTIL_safe(() => {
      const raw = W.localStorage?.getItem?.(key);
      return raw == null ? fallback : String(raw);
    }) ?? fallback;
  }

  function UTIL_setStr(key, value) {
    return (UTIL_safe(() => {
      W.localStorage?.setItem?.(key, String(value ?? ''));
      return true;
    }) === true);
  }

  function UTIL_normName(name) {
    return String(name ?? '').trim();
  }

  function SKIN_getByName(name) {
    const norm = UTIL_normName(name);
    if (!norm) return null;
    return SKIN_BY_NAME.get(norm.toLowerCase()) || SKIN_ALIAS_BY_NAME.get(norm.toLowerCase()) || null;
  }

  function SKIN_getDefault() {
    return SKIN_getByName(CFG_DEFAULT_SKIN_NAME) || SKIN_PRESETS[0];
  }

  function CSS_tokenValueToVar(tokenKey, value) {
    if (tokenKey === KEY_SCROLL_THIN) return value ? '1' : '0';
    return String(value);
  }

  function CSS_buildRootTokenBlock(tokens) {
    const rows = TOKEN_CSS_BINDINGS.map(([tokenKey, cssVar]) => `  ${cssVar}: ${CSS_tokenValueToVar(tokenKey, tokens[tokenKey])};`);
    return `:root {\n${rows.join('\n')}\n}`;
  }

  function CSS_buildScrollBlock(tokens) {
    if (!tokens[KEY_SCROLL_THIN]) return '';
    return `
${SEL_PANEL_SCROLL_SCOPE}{
  scrollbar-width: thin;
  scrollbar-color: var(${CSS_VAR_SCROLLBAR_THUMB}) transparent;
}
${SEL_PANEL_SCROLLBAR}{
  width: 8px;
  height: 8px;
}
${SEL_PANEL_SCROLLBAR_THUMB}{
  background: var(${CSS_VAR_SCROLLBAR_THUMB});
  border-radius: 10px;
}
${SEL_PANEL_SCROLLBAR_THUMB}:hover{
  background: var(${CSS_VAR_SCROLLBAR_THUMB_HOVER});
}
${SEL_PANEL_SCROLLBAR_TRACK}{
  background: transparent;
}
`;
  }

  function CSS_build(tokens) {
    return `
/* ===================== ${EMOJI_HDR} ${MODICON} ${MODTAG} (cgxui-owned) ===================== */
${CSS_buildRootTokenBlock(tokens)}

${SEL_PANEL}{
  color: var(${CSS_VAR_GLASS_TEXT});
  background: var(${CSS_VAR_PANEL_BG});
  border: 1px solid var(${CSS_VAR_PANEL_BORDER});
  box-shadow: var(${CSS_VAR_PANEL_SHADOW});
  filter: var(${CSS_VAR_PANEL_FILTER}) !important;
  backdrop-filter: var(${CSS_VAR_PANEL_BACKDROP});
  -webkit-backdrop-filter: var(${CSS_VAR_PANEL_BACKDROP});
}

${SEL_PANEL_TEXT_MUTE}{
  color: var(${CSS_VAR_GLASS_TEXT_MUTE});
}

${SEL_PANEL_BUTTONS}{
  color: var(${CSS_VAR_GLASS_TEXT});
  background: var(${CSS_VAR_BTN_BG});
  border: 1px solid var(${CSS_VAR_BTN_BORDER});
  transition: background-color .14s ease, border-color .14s ease, box-shadow .14s ease, filter .14s ease;
}

${SEL_PANEL_BUTTONS}:hover{
  background: var(${CSS_VAR_BTN_BG_HOVER});
}

${SEL_PANEL_BUTTONS}:active,
${SEL_PANEL_BUTTONS}[aria-selected="true"],
${SEL_PANEL_BUTTONS}[data-selected="true"]{
  background: var(${CSS_VAR_BTN_BG_ACTIVE});
  border-color: var(${CSS_VAR_BTN_BORDER_ACTIVE});
  box-shadow: var(${CSS_VAR_BTN_SHADOW_ACTIVE});
}

${SEL_PANEL_INPUTS}{
  color: var(${CSS_VAR_GLASS_TEXT});
  background: var(${CSS_VAR_INPUT_BG});
  border: 1px solid var(${CSS_VAR_INPUT_BORDER});
}

${SEL_PANEL_INPUT_PLACEHOLDERS}{
  color: var(${CSS_VAR_GLASS_TEXT_MUTE});
}

${SEL_PANEL_FOCUSABLE}:focus-visible{
  outline: 2px solid var(${CSS_VAR_FOCUS_RING});
  outline-offset: 2px;
}

${SEL_PANEL_SELECTION}{
  background: var(${CSS_VAR_SEL_BG});
  color: var(${CSS_VAR_GLASS_TEXT});
}
${CSS_buildScrollBlock(tokens)}
`;
  }

  function UI_ensureOwnedStyle() {
    let styleEl = D.getElementById(CSS_STYLE_ID);
    if (!styleEl) {
      styleEl = D.createElement('style');
      styleEl.id = CSS_STYLE_ID;
      styleEl.setAttribute(ATTR_CGXUI_OWNER, SkID);
      styleEl.setAttribute(ATTR_CGXUI, UI_STYLE);
      D.documentElement.appendChild(styleEl);
    } else {
      styleEl.setAttribute(ATTR_CGXUI_OWNER, SkID);
      styleEl.setAttribute(ATTR_CGXUI, UI_STYLE);
    }
    S.styleEl = styleEl;
    return styleEl;
  }

  function UI_clearRootVars() {
    const rootStyle = D.documentElement.style;
    for (const [, cssVar] of TOKEN_CSS_BINDINGS) rootStyle.removeProperty(cssVar);
    D.documentElement.removeAttribute(ATTR_ROOT_SKIN);
  }

  function EV_emitSkinChanged(name, reason) {
    const detail = { [KEY_DETAIL_NAME]: name, [KEY_DETAIL_REASON]: String(reason || STR_REASON_API_SET) };
    UTIL_safe(() => W.dispatchEvent(new CustomEvent(EV_SKIN_CHANGED, { detail })));
    UTIL_safe(() => H2O.bus?.emit?.(EV_SKIN_CHANGED, detail));
  }

  function CORE_applySkin(preset, reason, persist) {
    const next = preset || SKIN_getDefault();
    const prevName = String(S.activeName || '');
    const nextName = next.name;
    const styleEl = UI_ensureOwnedStyle();
    const cssText = CSS_build(next.tokens);
    if (styleEl.textContent !== cssText) styleEl.textContent = cssText;
    D.documentElement.setAttribute(ATTR_ROOT_SKIN, nextName);
    if (persist) UTIL_setStr(KEY_SKIN_ACTIVE_V1, nextName);
    S.activeName = nextName;
    const changed = prevName !== nextName;
    if (changed) EV_emitSkinChanged(nextName, reason);
    DIAG_step('skin:apply', { name: nextName, reason: String(reason || ''), changed });
    return nextName;
  }

  function API_setSkin(name, reason = STR_REASON_API_SET) {
    const preset = SKIN_getByName(name);
    if (!preset) {
      DIAG_step('skin:set:skip', { reason: STR_REASON_INVALID, name: UTIL_normName(name) });
      return String(S.activeName || SKIN_getDefault().name);
    }
    return CORE_applySkin(preset, reason, true);
  }

  function API_getSkin() {
    return String(S.activeName || SKIN_getDefault().name);
  }

  function API_listSkins() {
    return SKIN_NAME_LIST.slice();
  }

  function API_installGlobalFns() {
    if (!S.prevGlobalApi) {
      S.prevGlobalApi = {
        setSkin: W.H2O_setSkin,
        getSkin: W.H2O_getSkin,
        listSkins: W.H2O_listSkins,
      };
    }
    W.H2O_setSkin = API_setSkin;
    W.H2O_getSkin = API_getSkin;
    W.H2O_listSkins = API_listSkins;
  }

  function API_restoreGlobalFns() {
    if (!S.prevGlobalApi) return;

    if (W.H2O_setSkin === API_setSkin) {
      if (typeof S.prevGlobalApi.setSkin === 'function') W.H2O_setSkin = S.prevGlobalApi.setSkin;
      else {
        try { delete W.H2O_setSkin; } catch (_) { W.H2O_setSkin = undefined; }
      }
    }

    if (W.H2O_getSkin === API_getSkin) {
      if (typeof S.prevGlobalApi.getSkin === 'function') W.H2O_getSkin = S.prevGlobalApi.getSkin;
      else {
        try { delete W.H2O_getSkin; } catch (_) { W.H2O_getSkin = undefined; }
      }
    }

    if (W.H2O_listSkins === API_listSkins) {
      if (typeof S.prevGlobalApi.listSkins === 'function') W.H2O_listSkins = S.prevGlobalApi.listSkins;
      else {
        try { delete W.H2O_listSkins; } catch (_) { W.H2O_listSkins = undefined; }
      }
    }

    S.prevGlobalApi = null;
  }

  function CORE_boot(reason = STR_REASON_BOOT) {
    if (S.booted) return true;
    S.booted = true;
    W[KEY_GUARD_BOOT] = 1;

    API_installGlobalFns();

    const savedName = UTIL_getStr(KEY_SKIN_ACTIVE_V1, '');
    const preset = SKIN_getByName(savedName) || SKIN_getDefault();
    CORE_applySkin(preset, reason, false);

    DIAG_step('boot:done', { reason: String(reason || STR_REASON_BOOT), skin: preset.name });
    return true;
  }

  function CORE_dispose(reason = STR_REASON_DISPOSE) {
    try {
      if (S.styleEl?.isConnected) S.styleEl.remove();
      else D.getElementById(CSS_STYLE_ID)?.remove();
    } catch (err) {
      DIAG_error('dispose:style', err);
    }

    UI_clearRootVars();
    API_restoreGlobalFns();

    S.styleEl = null;
    S.activeName = '';
    S.booted = false;

    try { delete W[KEY_GUARD_BOOT]; } catch (_) {}
    DIAG_step('dispose:done', { reason: String(reason || STR_REASON_DISPOSE) });
    return true;
  }

  const API = Object.freeze({
    boot: CORE_boot,
    dispose: CORE_dispose,
    setSkin: API_setSkin,
    getSkin: API_getSkin,
    listSkins: API_listSkins,
  });

  const prevApi = VAULT.api;
  if (prevApi && prevApi !== API && typeof prevApi.dispose === 'function') {
    UTIL_safe(() => prevApi.dispose(STR_REASON_REPLACE));
  }
  VAULT.api = API;

  try {
    CORE_boot(STR_REASON_INIT);
  } catch (err) {
    DIAG_error('boot:crash', err);
    try { CORE_dispose(STR_REASON_BOOT_CRASH); } catch (_) {}
  }

  /*
   * How to consume tokens:
   * - CSS: `background: var(--h2o-panel-bg);`
   * - JS: `window.addEventListener('evt:h2o:skins:changed', (ev) => { ... });`
   */
})();
