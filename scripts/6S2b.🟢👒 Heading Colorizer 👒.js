// ==UserScript==
// @name         6S2b.🟢👒 Heading Colorizer 👒
// @namespace    H2O.ChatGPT.HeadingColorizer
// @version      0.4.2
// @description  Semantic heading hierarchy coloring/highlighting with per-chat or global settings.
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const CFG = {
    ANSWER_SEL: 'article[data-turn="assistant"]',
    HEADING_SEL: 'h1, h2, h3, h4',
    IGNORE_TEXT_RE: /^(chatgpt said:|you said:)$/i,

    STYLE_ID: 'h2o-hh-style',
    PANEL_ID: 'h2o-hh-panel',

    ATTR_MARK: 'data-h2o-heading',
    ATTR_LEVEL: 'data-h2o-heading-level',
    ATTR_FP: 'data-h2o-heading-fp',
    ATTR_MODE: 'data-h2o-heading-mode',
    ATTR_PRESET: 'data-h2o-heading-preset',

    CMD_OWNER: 'se',
    CMD_GROUP_ID: 'se.sections',
    CMD_CONTROL_ID: 'se.sections.headings',

    STORAGE_GLOBAL: 'h2o_heading_hierarchy_global',
    STORAGE_CHAT_PREFIX: 'h2o_heading_hierarchy_chat::',

    DEBOUNCE_MS: 120,
    DEBUG: false
  };

  const DEFAULT_SETTINGS = {
    enabled: false,
    styleMode: 'color', // color | highlight | both
    highlightStyle: 'bar', // bar | pill | underline | glow | outline | soft | glass | ribbon
    levels: {
      1: { textColor: '#7a4b2a', bgColor: 'rgba(122, 75, 42, 0.18)' },
      2: { textColor: '#b42318', bgColor: 'rgba(180, 35, 24, 0.18)' },
      3: { textColor: '#d97706', bgColor: 'rgba(217, 119, 6, 0.18)' },
      4: { textColor: '#2563eb', bgColor: 'rgba(37, 99, 235, 0.18)' }
    }
  };

  const state = {
    observer: null,
    dirtyAnswers: new Set(),
    flushTimer: null,
    started: false,

    activeScope: 'chat', // chat | global
    globalSettings: null,
    chatSettings: null,
    commandBarTimer: 0,
    commandBarBound: false,
    panelAnchorEl: null,
    panelOutsideBound: false
  };

  function log(...args) {
    if (CFG.DEBUG) console.log('[H2O HH]', ...args);
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function normalizeText(s) {
    return String(s || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeHighlightStyle(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'pill' || value === 'underline' || value === 'glow' || value === 'outline' || value === 'soft' || value === 'glass' || value === 'ribbon') return value;
    return 'bar';
  }

  function getChatId() {
    const m = location.pathname.match(/\/c\/([^/?#]+)/);
    if (m?.[1]) return m[1];

    const article = document.querySelector(`${CFG.ANSWER_SEL}[data-turn-id]`);
    if (article?.getAttribute('data-turn-id')) return `turn-${article.getAttribute('data-turn-id')}`;

    return 'unknown-chat';
  }

  function chatStorageKey() {
    return `${CFG.STORAGE_CHAT_PREFIX}${getChatId()}`;
  }

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return deepClone(fallback);
      return { ...deepClone(fallback), ...JSON.parse(raw) };
    } catch {
      return deepClone(fallback);
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function loadGlobalSettings() {
    const out = loadJSON(CFG.STORAGE_GLOBAL, DEFAULT_SETTINGS);
    out.levels = normalizeLevels(out.levels);
    out.highlightStyle = normalizeHighlightStyle(out.highlightStyle);
    return out;
  }

  function loadChatSettings() {
    const raw = loadJSON(chatStorageKey(), DEFAULT_SETTINGS);
    raw.levels = normalizeLevels(raw.levels);
    raw.highlightStyle = normalizeHighlightStyle(raw.highlightStyle);
    return raw;
  }

  function normalizeLevels(levels) {
    const base = deepClone(DEFAULT_SETTINGS.levels);
    for (const k of [1, 2, 3, 4]) {
      const lv = levels?.[k] || {};
      base[k] = {
        textColor: lv.textColor || base[k].textColor,
        bgColor: lv.bgColor || base[k].bgColor
      };
    }
    return base;
  }

  function getEffectiveSettings() {
    return state.activeScope === 'global'
      ? state.globalSettings
      : state.chatSettings;
  }

  function saveActiveSettings() {
    const settings = getEffectiveSettings();
    if (state.activeScope === 'global') {
      saveJSON(CFG.STORAGE_GLOBAL, settings);
    } else {
      saveJSON(chatStorageKey(), settings);
    }
  }


  function commitLiveChanges({ rerender = true, rescan = true } = {}) {
    saveActiveSettings();
    ensureStyle();
    if (rerender) renderPanelState();
    if (rescan) rescanAll();
  }

  function resetActiveSettings() {
    if (state.activeScope === 'global') {
      state.globalSettings = deepClone(DEFAULT_SETTINGS);
      saveJSON(CFG.STORAGE_GLOBAL, state.globalSettings);
    } else {
      state.chatSettings = deepClone(DEFAULT_SETTINGS);
      saveJSON(chatStorageKey(), state.chatSettings);
    }
  }

  function ensureStyle() {
    let style = document.getElementById(CFG.STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = CFG.STYLE_ID;
      document.head.appendChild(style);
    }

    const s = getEffectiveSettings();

    style.textContent = `
      :root {
        --h2o-hh-l1-text: ${s.levels[1].textColor};
        --h2o-hh-l2-text: ${s.levels[2].textColor};
        --h2o-hh-l3-text: ${s.levels[3].textColor};
        --h2o-hh-l4-text: ${s.levels[4].textColor};

        --h2o-hh-l1-bg: ${s.levels[1].bgColor};
        --h2o-hh-l2-bg: ${s.levels[2].bgColor};
        --h2o-hh-l3-bg: ${s.levels[3].bgColor};
        --h2o-hh-l4-bg: ${s.levels[4].bgColor};
      }

      .h2o-hh-mark {
        transition:
          color .18s ease,
          background-color .18s ease,
          box-shadow .18s ease,
          border-color .18s ease,
          outline-color .18s ease,
          text-shadow .18s ease;
        border-radius: 8px;
      }

      .h2o-hh-mode-color.h2o-hh-l1,
      .h2o-hh-mode-both.h2o-hh-l1 { color: var(--h2o-hh-l1-text) !important; }
      .h2o-hh-mode-color.h2o-hh-l2,
      .h2o-hh-mode-both.h2o-hh-l2 { color: var(--h2o-hh-l2-text) !important; }
      .h2o-hh-mode-color.h2o-hh-l3,
      .h2o-hh-mode-both.h2o-hh-l3 { color: var(--h2o-hh-l3-text) !important; }
      .h2o-hh-mode-color.h2o-hh-l4,
      .h2o-hh-mode-both.h2o-hh-l4 { color: var(--h2o-hh-l4-text) !important; }

      .h2o-hh-preset-bar.h2o-hh-l1,
      .h2o-hh-preset-pill.h2o-hh-l1,
      .h2o-hh-preset-underline.h2o-hh-l1,
      .h2o-hh-preset-glow.h2o-hh-l1,
      .h2o-hh-preset-outline.h2o-hh-l1 {
        --h2o-hh-text: var(--h2o-hh-l1-text);
        --h2o-hh-bg: var(--h2o-hh-l1-bg);
      }

      .h2o-hh-preset-bar.h2o-hh-l2,
      .h2o-hh-preset-pill.h2o-hh-l2,
      .h2o-hh-preset-underline.h2o-hh-l2,
      .h2o-hh-preset-glow.h2o-hh-l2,
      .h2o-hh-preset-outline.h2o-hh-l2 {
        --h2o-hh-text: var(--h2o-hh-l2-text);
        --h2o-hh-bg: var(--h2o-hh-l2-bg);
      }

      .h2o-hh-preset-bar.h2o-hh-l3,
      .h2o-hh-preset-pill.h2o-hh-l3,
      .h2o-hh-preset-underline.h2o-hh-l3,
      .h2o-hh-preset-glow.h2o-hh-l3,
      .h2o-hh-preset-outline.h2o-hh-l3 {
        --h2o-hh-text: var(--h2o-hh-l3-text);
        --h2o-hh-bg: var(--h2o-hh-l3-bg);
      }

      .h2o-hh-preset-bar.h2o-hh-l4,
      .h2o-hh-preset-pill.h2o-hh-l4,
      .h2o-hh-preset-underline.h2o-hh-l4,
      .h2o-hh-preset-glow.h2o-hh-l4,
      .h2o-hh-preset-outline.h2o-hh-l4 {
        --h2o-hh-text: var(--h2o-hh-l4-text);
        --h2o-hh-bg: var(--h2o-hh-l4-bg);
      }

      .h2o-hh-mode-highlight.h2o-hh-preset-bar,
      .h2o-hh-mode-both.h2o-hh-preset-bar {
        background: var(--h2o-hh-bg) !important;
        box-shadow: inset 3px 0 0 var(--h2o-hh-text);
        padding: 0.08em 0.32em;
      }

      .h2o-hh-mode-highlight.h2o-hh-preset-pill,
      .h2o-hh-mode-both.h2o-hh-preset-pill {
        background: var(--h2o-hh-bg) !important;
        border-radius: 999px;
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--h2o-hh-text) 35%, transparent);
        padding: 0.12em 0.48em;
      }

      .h2o-hh-mode-highlight.h2o-hh-preset-underline,
      .h2o-hh-mode-both.h2o-hh-preset-underline {
        background: linear-gradient(180deg, transparent 58%, var(--h2o-hh-bg) 58%) !important;
        box-shadow: inset 0 -0.2em 0 var(--h2o-hh-bg);
        border-radius: 0;
        padding: 0 0.1em;
      }

      .h2o-hh-mode-highlight.h2o-hh-preset-glow,
      .h2o-hh-mode-both.h2o-hh-preset-glow {
        background: color-mix(in srgb, var(--h2o-hh-bg) 92%, transparent) !important;
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--h2o-hh-text) 22%, transparent), 0 0 18px color-mix(in srgb, var(--h2o-hh-text) 24%, transparent);
        text-shadow: 0 0 10px color-mix(in srgb, var(--h2o-hh-text) 18%, transparent);
        padding: 0.1em 0.42em;
      }

      .h2o-hh-mode-highlight.h2o-hh-preset-outline,
      .h2o-hh-mode-both.h2o-hh-preset-outline {
        background: color-mix(in srgb, var(--h2o-hh-bg) 45%, transparent) !important;
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--h2o-hh-text) 55%, transparent);
        padding: 0.1em 0.38em;
      }

      .h2o-hh-mode-highlight.h2o-hh-preset-soft,
      .h2o-hh-mode-both.h2o-hh-preset-soft {
        background: linear-gradient(180deg, color-mix(in srgb, var(--h2o-hh-bg) 58%, transparent), color-mix(in srgb, var(--h2o-hh-bg) 85%, transparent)) !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 10px 24px color-mix(in srgb, var(--h2o-hh-text) 10%, transparent);
        border-radius: .5em;
        padding: .12em .44em;
      }

      .h2o-hh-mode-highlight.h2o-hh-preset-glass,
      .h2o-hh-mode-both.h2o-hh-preset-glass {
        background: linear-gradient(180deg, color-mix(in srgb, #fff 14%, var(--h2o-hh-bg)), color-mix(in srgb, transparent 18%, var(--h2o-hh-bg))) !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.22), inset 0 0 0 1px color-mix(in srgb, var(--h2o-hh-text) 26%, transparent), 0 12px 30px color-mix(in srgb, var(--h2o-hh-text) 12%, transparent);
        border-radius: .6em;
        padding: .12em .46em;
      }

      .h2o-hh-mode-highlight.h2o-hh-preset-ribbon,
      .h2o-hh-mode-both.h2o-hh-preset-ribbon {
        background: linear-gradient(90deg, color-mix(in srgb, var(--h2o-hh-text) 18%, transparent), color-mix(in srgb, var(--h2o-hh-bg) 82%, transparent) 18%, transparent 100%) !important;
        box-shadow: inset 4px 0 0 var(--h2o-hh-text);
        border-radius: .25em;
        padding: .08em .4em .08em .5em;
      }

      #${CFG.PANEL_ID} {
        position: fixed;
        right: 18px;
        bottom: 188px;
        width: 372px;
        max-width: min(372px, calc(100vw - 20px));
        max-height: min(78vh, 760px);
        overflow: auto;
        overscroll-behavior: contain;
        z-index: 2147483647;
        border-radius: 22px;
        border: 1px solid rgba(181, 162, 255, 0.18);
        background:
          radial-gradient(circle at top left, rgba(182, 125, 255, 0.16), transparent 34%),
          radial-gradient(circle at top right, rgba(102, 153, 255, 0.14), transparent 32%),
          linear-gradient(180deg, rgba(28, 24, 40, 0.97), rgba(14, 16, 24, 0.98));
        color: white;
        box-shadow: 0 22px 56px rgba(0,0,0,.46), 0 0 0 1px rgba(255,255,255,.04) inset;
        backdrop-filter: blur(16px) saturate(1.14);
        padding: 14px;
        font: 500 12px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      #${CFG.PANEL_ID}::before {
        content: '';
        position: absolute;
        right: 28px;
        bottom: -8px;
        width: 16px;
        height: 16px;
        background: linear-gradient(135deg, rgba(32,28,48,.98), rgba(18,20,30,.98));
        border-right: 1px solid rgba(181, 162, 255, 0.18);
        border-bottom: 1px solid rgba(181, 162, 255, 0.18);
        transform: rotate(45deg);
        box-shadow: 8px 8px 18px rgba(0,0,0,.2);
      }

      #${CFG.PANEL_ID}[hidden] {
        display: none !important;
      }

      .h2o-hh-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }

      .h2o-hh-title {
        font-weight: 800;
        font-size: 14px;
        letter-spacing: .02em;
        margin: 0 0 4px;
      }

      .h2o-hh-sub {
        font-size: 11px;
        opacity: .72;
      }

      .h2o-hh-close {
        width: 32px;
        height: 32px;
        flex: 0 0 32px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.06);
        color: rgba(255,255,255,.92);
        cursor: pointer;
        transition: transform .14s ease, background-color .14s ease, border-color .14s ease, box-shadow .14s ease;
      }

      .h2o-hh-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
      }

      .h2o-hh-col {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 12px;
        padding: 12px;
        border-radius: 16px;
        background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03));
        border: 1px solid rgba(255,255,255,.07);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
      }

      .h2o-hh-label {
        font-size: 10px;
        letter-spacing: .08em;
        text-transform: uppercase;
        opacity: .76;
      }

      .h2o-hh-seg {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }

      .h2o-hh-col[data-compact="1"] .h2o-hh-seg {
        gap: 6px;
      }

      .h2o-hh-seg button,
      .h2o-hh-act,
      .h2o-hh-close {
        border: 1px solid rgba(255,255,255,0.1);
        cursor: pointer;
        color: white;
        font: inherit;
        transition: transform .14s ease, background-color .14s ease, border-color .14s ease, box-shadow .14s ease, opacity .14s ease;
      }

      .h2o-hh-seg button,
      .h2o-hh-act {
        position: relative;
        min-height: 34px;
        border-radius: 12px;
        padding: 8px 12px;
        background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.05));
      }

      .h2o-hh-col[data-compact="1"] .h2o-hh-seg button {
        min-height: 30px;
        padding: 6px 10px;
        border-radius: 11px;
      }

      .h2o-hh-seg button::after {
        content: '';
        position: absolute;
        inset: 1px;
        border-radius: inherit;
        background: linear-gradient(180deg, rgba(255,255,255,.07), transparent 55%);
        pointer-events: none;
        opacity: .9;
      }

      .h2o-hh-seg button:hover,
      .h2o-hh-act:hover,
      .h2o-hh-close:hover {
        transform: translateY(-1px);
        background-color: rgba(255,255,255,0.12);
      }

      .h2o-hh-seg button:focus-visible,
      .h2o-hh-act:focus-visible,
      .h2o-hh-close:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px rgba(196, 170, 255, 0.55), 0 0 0 5px rgba(126, 97, 255, 0.18);
      }

      .h2o-hh-seg button[data-active="1"] {
        background: linear-gradient(180deg, rgba(176, 132, 255, 0.34), rgba(95, 124, 255, 0.22));
        border-color: rgba(189, 167, 255, 0.58);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08), 0 0 0 1px rgba(189,167,255,0.18), 0 12px 24px rgba(96,110,255,0.18);
      }

      .h2o-hh-seg button.is-pressed,
      .h2o-hh-act.is-pressed {
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08), 0 0 0 2px rgba(196,170,255,0.42), 0 0 0 5px rgba(126,97,255,0.14), 0 12px 24px rgba(96,110,255,0.18);
      }

      .h2o-hh-stylegrid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }

      .h2o-hh-stylegrid button {
        justify-content: flex-start;
        text-align: left;
        padding: 10px 10px;
      }

      .h2o-hh-stylegrid button span {
        display: block;
        position: relative;
        z-index: 1;
      }

      .h2o-hh-stylegrid button .h2o-hh-stylehint {
        margin-top: 4px;
        font-size: 10px;
        opacity: .66;
      }

      .h2o-hh-level {
        border-radius: 16px;
        padding: 12px;
        background: linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.03));
        border: 1px solid rgba(255,255,255,.07);
        margin-bottom: 10px;
      }

      .h2o-hh-level-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        font-weight: 700;
      }

      .h2o-hh-level-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 28px;
        height: 22px;
        padding: 0 8px;
        border-radius: 999px;
        font-size: 10px;
        letter-spacing: .06em;
        text-transform: uppercase;
        border: 1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.06);
        opacity: .92;
      }

      .h2o-hh-inputs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .h2o-hh-inputs label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 11px;
        opacity: .9;
      }

      .h2o-hh-inputs input[type="color"] {
        width: 100%;
        height: 34px;
        border: 0;
        background: transparent;
        padding: 0;
        cursor: pointer;
      }

      .h2o-hh-foot {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 8px;
      }
    `;
  }
  function ensurePanel() {
    let panel = document.getElementById(CFG.PANEL_ID);
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = CFG.PANEL_ID;
    panel.hidden = true;
    panel.innerHTML = `
      <div class="h2o-hh-head">
        <div>
          <div class="h2o-hh-title">Heading Hierarchy</div>
          <div class="h2o-hh-sub">Premium heading colors, highlight presets, and per-chat or global control.</div>
        </div>
        <button type="button" class="h2o-hh-close" data-action="close" aria-label="Close heading panel">×</button>
      </div>

      <div class="h2o-hh-col" data-compact="1">
        <div class="h2o-hh-label">Enable</div>
        <div class="h2o-hh-seg" data-role="enabled">
          <button type="button" data-value="true">ON</button>
          <button type="button" data-value="false">OFF</button>
        </div>
      </div>

      <div class="h2o-hh-col" data-compact="1">
        <div class="h2o-hh-label">Scope</div>
        <div class="h2o-hh-seg" data-role="scope">
          <button type="button" data-value="chat">This Chat</button>
          <button type="button" data-value="global">Global</button>
        </div>
      </div>

      <div class="h2o-hh-col" data-compact="1">
        <div class="h2o-hh-label">Style Mode</div>
        <div class="h2o-hh-seg" data-role="styleMode">
          <button type="button" data-value="color">Color</button>
          <button type="button" data-value="highlight">Highlight</button>
          <button type="button" data-value="both">Both</button>
        </div>
      </div>

      <div class="h2o-hh-col">
        <div class="h2o-hh-label">Highlight Style</div>
        <div class="h2o-hh-seg h2o-hh-stylegrid" data-role="highlightStyle">
          <button type="button" data-value="bar"><span>Bar</span><span class="h2o-hh-stylehint">left accent</span></button>
          <button type="button" data-value="pill"><span>Pill</span><span class="h2o-hh-stylehint">rounded tag</span></button>
          <button type="button" data-value="underline"><span>Underline</span><span class="h2o-hh-stylehint">clean marker</span></button>
          <button type="button" data-value="glow"><span>Glow</span><span class="h2o-hh-stylehint">soft neon</span></button>
          <button type="button" data-value="outline"><span>Outline</span><span class="h2o-hh-stylehint">precise frame</span></button>
          <button type="button" data-value="soft"><span>Soft</span><span class="h2o-hh-stylehint">luxury wash</span></button>
          <button type="button" data-value="glass"><span>Glass</span><span class="h2o-hh-stylehint">frosted glow</span></button>
          <button type="button" data-value="ribbon"><span>Ribbon</span><span class="h2o-hh-stylehint">editorial edge</span></button>
        </div>
      </div>

      <div id="h2o-hh-levels"></div>

      <div class="h2o-hh-foot">
        <button type="button" class="h2o-hh-act" data-action="reset-chat">Reset Chat</button>
        <button type="button" class="h2o-hh-act" data-action="reset-global">Reset Global</button>
      </div>
    `;

    panel.addEventListener('click', onPanelClick);
    panel.addEventListener('input', onPanelInput);

    document.documentElement.appendChild(panel);
    renderLevels();
    return panel;
  }

  function renderLevels() {
    const panel = ensurePanel();
    const host = panel.querySelector('#h2o-hh-levels');
    const s = getEffectiveSettings();

    host.innerHTML = '';

    for (const level of [1, 2, 3, 4]) {
      const row = document.createElement('div');
      row.className = 'h2o-hh-level';
      row.dataset.level = String(level);
      row.innerHTML = `
        <div class="h2o-hh-level-top">
          <span>Level ${level}</span>
          <span class="h2o-hh-level-chip">H${level}</span>
        </div>
        <div class="h2o-hh-inputs">
          <label>
            <span>Text Color</span>
            <input type="color" data-kind="textColor" data-level="${level}" value="${toColorInputValue(s.levels[level].textColor)}">
          </label>
          <label>
            <span>Highlight</span>
            <input type="color" data-kind="bgColor" data-level="${level}" value="${rgbaToHex(s.levels[level].bgColor)}">
          </label>
        </div>
      `;
      host.appendChild(row);
    }
  }

  function renderPanelState() {
    const panel = ensurePanel();
    const s = getEffectiveSettings();

    panel.querySelectorAll('[data-role="enabled"] button').forEach(btn => {
      btn.dataset.active = String(String(s.enabled) === btn.dataset.value ? 1 : 0);
    });

    panel.querySelectorAll('[data-role="scope"] button').forEach(btn => {
      btn.dataset.active = String(state.activeScope === btn.dataset.value ? 1 : 0);
    });

    panel.querySelectorAll('[data-role="styleMode"] button').forEach(btn => {
      btn.dataset.active = String(s.styleMode === btn.dataset.value ? 1 : 0);
    });

    panel.querySelectorAll('[data-role="highlightStyle"] button').forEach(btn => {
      btn.dataset.active = String(s.highlightStyle === btn.dataset.value ? 1 : 0);
    });

    renderLevels();
  }

  function onPanelClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;

    const roleHost = btn.closest('[data-role]');
    if (roleHost) {
      const role = roleHost.dataset.role;
      const value = btn.dataset.value;

      if (role === 'enabled') {
        pulseButton(btn);
        getEffectiveSettings().enabled = value === 'true';
        commitLiveChanges();
        return;
      }

      if (role === 'scope') {
        pulseButton(btn);
        state.activeScope = value;
        commitLiveChanges();
        return;
      }

      if (role === 'styleMode') {
        pulseButton(btn);
        getEffectiveSettings().styleMode = value;
        commitLiveChanges();
        return;
      }

      if (role === 'highlightStyle') {
        pulseButton(btn);
        getEffectiveSettings().highlightStyle = normalizeHighlightStyle(value);
        commitLiveChanges();
        return;
      }
    }

    const action = btn.dataset.action;
    if (!action) return;

    if (action === 'close') {
      closePanel();
      return;
    }

    pulseButton(btn);

    if (action === 'reset-chat') {
      state.chatSettings = deepClone(DEFAULT_SETTINGS);
      saveJSON(chatStorageKey(), state.chatSettings);
      if (state.activeScope === 'chat') {
        commitLiveChanges();
      }
      return;
    }

    if (action === 'reset-global') {
      state.globalSettings = deepClone(DEFAULT_SETTINGS);
      saveJSON(CFG.STORAGE_GLOBAL, state.globalSettings);
      if (state.activeScope === 'global') {
        commitLiveChanges();
      }
    }
  }

  function onPanelInput(e) {
    const input = e.target;
    if (!(input instanceof HTMLInputElement)) return;

    const kind = input.dataset.kind;
    const level = Number(input.dataset.level);
    if (!kind || !level) return;

    const s = getEffectiveSettings();

    if (kind === 'textColor') {
      s.levels[level].textColor = input.value;
    } else if (kind === 'bgColor') {
      s.levels[level].bgColor = hexToRgba(input.value, 0.18);
    }

    saveActiveSettings();
    ensureStyle();
    rescanAll();
  }

  function toColorInputValue(v) {
    if (!v) return '#000000';
    if (v.startsWith('#')) return v;
    if (v.startsWith('rgb')) return rgbaToHex(v);
    return '#000000';
  }

  function rgbaToHex(rgba) {
    const m = String(rgba).match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    if (!m) return '#000000';
    const r = Number(m[1]).toString(16).padStart(2, '0');
    const g = Number(m[2]).toString(16).padStart(2, '0');
    const b = Number(m[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  function hexToRgba(hex, alpha = 0.18) {
    const clean = String(hex).replace('#', '');
    const full = clean.length === 3
      ? clean.split('').map(x => x + x).join('')
      : clean.padEnd(6, '0').slice(0, 6);

    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function isIgnoredHeading(el) {
    if (!el || !(el instanceof Element)) return true;
    if (!isVisible(el)) return true;
    if (el.matches('.sr-only')) return true;
    if (el.closest('pre, code, table')) return true;

    const text = normalizeText(el.innerText || el.textContent || '');
    if (!text) return true;
    if (CFG.IGNORE_TEXT_RE.test(text)) return true;

    return false;
  }

  function tagToLevel(tagName) {
    const n = Number(String(tagName || '').replace(/^h/i, ''));
    return Math.min(Math.max(n || 4, 1), 4);
  }

  function getAnswerId(answerEl) {
    return (
      answerEl?.getAttribute('data-turn-id') ||
      answerEl?.getAttribute('data-testid') ||
      answerEl?.id ||
      null
    );
  }

  function makeFingerprint(answerId, level, text, index) {
    return [answerId || 'unknown', level, normalizeText(text), index].join('::');
  }

  function clearHeadingMarks(answerEl) {
    if (!answerEl) return;
    answerEl.querySelectorAll(`[${CFG.ATTR_MARK}="1"]`).forEach(el => {
      el.classList.remove(
        'h2o-hh-mark',
        'h2o-hh-l1', 'h2o-hh-l2', 'h2o-hh-l3', 'h2o-hh-l4',
        'h2o-hh-mode-color', 'h2o-hh-mode-highlight', 'h2o-hh-mode-both',
        'h2o-hh-preset-bar', 'h2o-hh-preset-pill', 'h2o-hh-preset-underline', 'h2o-hh-preset-glow', 'h2o-hh-preset-outline'
      );
      el.removeAttribute(CFG.ATTR_MARK);
      el.removeAttribute(CFG.ATTR_LEVEL);
      el.removeAttribute(CFG.ATTR_FP);
      el.removeAttribute(CFG.ATTR_MODE);
      el.removeAttribute(CFG.ATTR_PRESET);
    });
  }

  function clearAllMarks() {
    document.querySelectorAll(CFG.ANSWER_SEL).forEach(clearHeadingMarks);
  }

  function applyHeadingMark(el, level, fp, mode, preset) {
    const safePreset = normalizeHighlightStyle(preset);
    el.classList.add(
      'h2o-hh-mark',
      `h2o-hh-l${level}`,
      `h2o-hh-mode-${mode}`,
      `h2o-hh-preset-${safePreset}`
    );
    el.setAttribute(CFG.ATTR_MARK, '1');
    el.setAttribute(CFG.ATTR_LEVEL, String(level));
    el.setAttribute(CFG.ATTR_FP, fp);
    el.setAttribute(CFG.ATTR_MODE, mode);
    el.setAttribute(CFG.ATTR_PRESET, safePreset);
  }

  function scanAnswer(answerEl) {
    const answerId = getAnswerId(answerEl);
    const headings = [];
    const seen = new Set();
    let index = 0;

    answerEl.querySelectorAll(CFG.HEADING_SEL).forEach(el => {
      if (isIgnoredHeading(el)) return;

      const text = normalizeText(el.innerText || el.textContent || '');
      const level = tagToLevel(el.tagName.toLowerCase());
      const dedupeKey = `${level}::${text}`;
      if (seen.has(dedupeKey)) {
        index += 1;
        return;
      }
      seen.add(dedupeKey);

      headings.push({
        el,
        level,
        text,
        index,
        fp: makeFingerprint(answerId, level, text, index)
      });

      index += 1;
    });

    return { answerId, headings };
  }

  function applyAnswer(answerEl) {
    clearHeadingMarks(answerEl);

    const s = getEffectiveSettings();
    if (!s.enabled) return;

    const scan = scanAnswer(answerEl);
    for (const row of scan.headings) {
      applyHeadingMark(row.el, row.level, row.fp, s.styleMode, s.highlightStyle);
    }
  }

  function rescanAll() {
    const s = getEffectiveSettings();
    if (!s.enabled) {
      clearAllMarks();
      return;
    }

    document.querySelectorAll(CFG.ANSWER_SEL).forEach(applyAnswer);
  }

  function scheduleFlush() {
    if (state.flushTimer) return;
    state.flushTimer = setTimeout(flushDirtyAnswers, CFG.DEBOUNCE_MS);
  }

  function markDirtyFromNode(node) {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    if (!el?.closest) return;
    const answer = el.closest(CFG.ANSWER_SEL);
    if (!answer) return;
    state.dirtyAnswers.add(answer);
    scheduleFlush();
  }

  function flushDirtyAnswers() {
    clearTimeout(state.flushTimer);
    state.flushTimer = null;

    const s = getEffectiveSettings();
    const answers = [...state.dirtyAnswers];
    state.dirtyAnswers.clear();

    if (!s.enabled) return;

    answers.forEach(answerEl => {
      if (document.contains(answerEl)) applyAnswer(answerEl);
    });
  }

  function startObserver() {
    if (state.observer) return;

    const root = document.querySelector('main') || document.body;
    state.observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          m.addedNodes?.forEach(markDirtyFromNode);
        } else if (m.type === 'characterData') {
          markDirtyFromNode(m.target);
        }
      }
    });

    state.observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function repositionPanel(anchorEl = null) {
    const panel = ensurePanel();
    const anchor = anchorEl || state.panelAnchorEl;
    if (!(anchor instanceof Element) || !document.contains(anchor)) {
      panel.style.left = '';
      panel.style.top = '';
      panel.style.right = '18px';
      panel.style.bottom = '188px';
      return;
    }

    state.panelAnchorEl = anchor;
    const rect = anchor.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const gap = 12;
    const width = Math.min(panelRect.width || 372, window.innerWidth - 20);
    let left = rect.right - width;
    left = Math.max(10, Math.min(left, window.innerWidth - width - 10));
    const top = Math.max(10, rect.top - (panelRect.height || 520) - gap);

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function closePanel() {
    const panel = ensurePanel();
    panel.hidden = true;
    return panel;
  }

  function bindOutsidePanelClose() {
    if (state.panelOutsideBound) return;
    state.panelOutsideBound = true;

    document.addEventListener('mousedown', (e) => {
      const panel = document.getElementById(CFG.PANEL_ID);
      if (!panel || panel.hidden) return;
      const target = e.target;
      if (target instanceof Node && panel.contains(target)) return;
      if (state.panelAnchorEl instanceof Node && state.panelAnchorEl.contains(target)) return;
      closePanel();
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePanel();
    }, true);

    window.addEventListener('resize', () => {
      const panel = document.getElementById(CFG.PANEL_ID);
      if (panel && !panel.hidden) repositionPanel();
    });

    window.addEventListener('scroll', () => {
      const panel = document.getElementById(CFG.PANEL_ID);
      if (panel && !panel.hidden) repositionPanel();
    }, true);
  }

  function pulseButton(btn) {
    if (!(btn instanceof HTMLElement)) return;
    btn.classList.remove('is-pressed');
    void btn.offsetWidth;
    btn.classList.add('is-pressed');
    window.setTimeout(() => btn.classList.remove('is-pressed'), 320);
  }

  function openPanel(anchorEl = null) {
    const panel = ensurePanel();
    panel.hidden = false;
    if (anchorEl instanceof Element) state.panelAnchorEl = anchorEl;
    renderPanelState();
    repositionPanel(anchorEl);
    bindOutsidePanelClose();
    return panel;
  }

  function togglePanel(forceOpen = null, anchorEl = null) {
    const panel = ensurePanel();
    const next = forceOpen == null ? panel.hidden : !!forceOpen;
    if (!next) {
      closePanel();
      return false;
    }
    openPanel(anchorEl);
    return true;
  }

  function syncCommandBar() {
    const api = window.H2O?.commandBar;
    if (!api || typeof api.registerControl !== 'function') return false;
    try {
      if (typeof api.registerGroup === 'function') {
        api.registerGroup({
          id: CFG.CMD_GROUP_ID,
          owner: CFG.CMD_OWNER,
          zone: 'main',
          order: 460,
          label: ''
        });
      }
      api.registerControl({
        id: CFG.CMD_CONTROL_ID,
        owner: CFG.CMD_OWNER,
        groupId: CFG.CMD_GROUP_ID,
        type: 'button',
        zone: 'main',
        windowId: 'sections',
        order: 1,
        text: 'Headings',
        title: 'Open heading panel',
        /* Feature UI action: belongs in Side Actions → Sections tab */
        sideAction: true,
        sideTab: 'sections',
        onClick: (ctx = {}) => {
          const anchorEl = ctx?.buttonEl || ctx?.el || ctx?.target || ctx?.event?.currentTarget || document.activeElement;
          openPanel(anchorEl);
        }
      });
      state.commandBarBound = true;
      return true;
    } catch (err) {
      log('command bar binding failed', err);
      return false;
    }
  }

  function scheduleCommandBarSync() {
    if (state.commandBarBound) return;
    if (syncCommandBar()) return;
    if (state.commandBarTimer) return;
    state.commandBarTimer = window.setInterval(() => {
      if (syncCommandBar()) {
        window.clearInterval(state.commandBarTimer);
        state.commandBarTimer = 0;
      }
    }, 1200);
  }

  function initState() {
    state.globalSettings = loadGlobalSettings();
    state.chatSettings = loadChatSettings();
  }

  function init() {
    if (state.started) return;
    state.started = true;

    initState();
    ensureStyle();
    ensurePanel();
    bindOutsidePanelClose();
    renderPanelState();
    startObserver();
    rescanAll();
    scheduleCommandBarSync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.H2OHeadingHierarchyPanel = {
    getChatId,
    getScope: () => state.activeScope,
    setScope(scope) {
      if (scope === 'chat' || scope === 'global') {
        state.activeScope = scope;
        ensureStyle();
        renderPanelState();
        rescanAll();
      }
    },
    getGlobalSettings: () => deepClone(state.globalSettings),
    getChatSettings: () => deepClone(state.chatSettings),
    openPanel,
    togglePanel,
    rescanAll,
    clearAllMarks
  };
})();