// ==UserScript==
// @h2o-id      6a.export.chat
// @name         6a.🟦📀 Export Chat 📀
// @namespace    H2O.ChatGPT.Export
// @version      2.2.4
// @description  Q&A export (MD/PDF), Topbar Export button, MiniMap selection circles (outside boxes) + Select-All dot.
// @author       HumamDev
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// @require      https://unpkg.com/html-docx-js/dist/html-docx.js
// ==/UserScript==

(() => {
  'use strict';

  /* ───────────────────────────── 0) Identity (Contract) ───────────────────────────── */
  /** @core Identity + namespace anchors (mechanics only). */
  const TOK = 'EC';
  const PID = 'xprtcht';
  const CID = 'echat';
  const SkID = 'xpch';

  const MODTAG = 'EChat';
  const MODICON = '📀';
  const EMOJI_HDR = 'OFF';

  const SUITE = 'prm';
  const HOST = 'cgx';

  // ✅ CANONICAL IDs (contracts)
  const BrID = PID;
  const DsID = PID;

  // ✅ Derived (identifiers only)
  const PID_UP = PID.toUpperCase();
  const CID_UP = CID.toUpperCase();

  /* ───────────────────────────── 1) Constants (no raw strings) ───────────────────────────── */
  const ATTR_ = Object.freeze({
    MSG_ROLE: 'data-message-author-role',
    MSG_ID: 'data-message-id',
    LEGACY_HO_ID: 'data-ho-id',
    DATA_ID: 'data-id',
    TESTID: 'data-testid',
    DATETIME: 'datetime',
    FMT: 'data-fmt',
    MODE: 'data-mode',
    HL: 'data-hl',
    CGXUI: 'data-cgxui',
    CGXUI_OWNER: 'data-cgxui-owner',
    CGXUI_STATE: 'data-cgxui-state',
  });

  const CLEAN_ = Object.freeze({
    INIT_GUARD: `h2o.guard:${SUITE}:${HOST}:${PID}:init`,
  });

const EV_ = Object.freeze({
  MM_READY: 'evt:h2o:minimap:ready',
  NAVIGATE: 'evt:h2o:navigate',
});

const MIG_ = Object.freeze({
  LEG_MM_READY: 'ho-minimap:ready',
  LEG_NAVIGATE: 'ho:navigate',
});

const EXPORT_CONTROL_WAIT_MS = 2200;

  const UI_ = Object.freeze({
    STYLE: `${SkID}-style`,
    DL_LAYER: `${SkID}-dl-layer`,
    DL_MARK: `${SkID}-dl-mark`,
    DL_MENU: `${SkID}-dl-menu`,
    DL_MENU_SECTION: `${SkID}-dl-menu-section`,
    DL_FORMAT_ROW: `${SkID}-dl-format-row`,
    DL_FORMAT_BTN: `${SkID}-dl-format-btn`,
    DL_MENU_ITEM: `${SkID}-dl-menu-item`,
    DL_MENU_SEP: `${SkID}-dl-menu-sep`,
    DL_TOGGLE: `${SkID}-dl-toggle`,
    DL_SELECT_ALL: `${SkID}-dl-selectall`,
    DL_ICON: `${SkID}-dl-icon`,
    DL_TEXT: `${SkID}-dl-text`,
  });

  const CSS_ = Object.freeze({
    STYLE_ID: `cgxui-${SkID}-style`,
  });

  const CLS_ = Object.freeze({
    DL_LAYER: `cgxui-${SkID}-dl-layer`,
    DL_MARK: `cgxui-${SkID}-dl-mark`,
    DL_MENU: `cgxui-${SkID}-dl-menu`,
    DL_MENU_SECTION: `cgxui-${SkID}-dl-menu-section`,
    DL_FORMAT_ROW: `cgxui-${SkID}-dl-format-row`,
    DL_FORMAT_BTN: `cgxui-${SkID}-dl-format-btn`,
    DL_MENU_ITEM: `cgxui-${SkID}-dl-menu-item`,
    DL_MENU_SEP: `cgxui-${SkID}-dl-menu-sep`,
    DL_ICON: `cgxui-${SkID}-dl-icon`,
    DL_TOGGLE: `cgxui-${SkID}-dl-toggle`,
    DL_SELECT_ALL: `cgxui-${SkID}-dl-selectall`,
    STATE_ACTIVE: `cgxui-${SkID}-active`,
    STATE_SELECTED: `cgxui-${SkID}-selected`,
    STATE_OPEN: `cgxui-${SkID}-open`,
  });


  // Icons (no raw strings in markup; centralized SVGs)
  const ICON_ = Object.freeze({
    ONE: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6 6h4"/><path d="M6 10h4"/><path d="M6 14h4"/>
      <path d="M10 6l4 6-4 6"/><path d="M14 12h6"/><path d="M17 9l3 3-3 3"/>
      <path d="M18 15v4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-1"/>
    </svg>`,
    MULTI: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3v6"/><path d="M9 6l3 3 3-3"/><path d="M12 9v2"/>
      <path d="M12 11c0 2-6 2-6 5"/><path d="M12 11c0 2-2 2-2 5"/>
      <path d="M12 11c0 2 2 2 2 5"/><path d="M12 11c0 2 6 2 6 5"/>
      <path d="M6 16v5"/><path d="M4.7 19.5L6 21l1.3-1.5"/>
      <path d="M10 16v5"/><path d="M8.7 19.5L10 21l1.3-1.5"/>
      <path d="M14 16v5"/><path d="M12.7 19.5L14 21l1.3-1.5"/>
      <path d="M18 16v5"/><path d="M16.7 19.5L18 21l1.3-1.5"/>
    </svg>`,
  });

  const ID_ = Object.freeze({
    TOPBTN: `cgxui-${SkID}-export-btn`,
    TOPBTN_WRAP: `cgxui-${SkID}-export-wrap`,
  });

  const CONTROL_BTN_SELECTOR = '[data-cgxui="cnhb-topbtn"][data-cgxui-owner="cnhb"]';

  const SEL_ = Object.freeze({
    ANSWER: () => (window.ANSWER_SELECTOR || `[${ATTR_.MSG_ROLE}="assistant"]`),
    ANSWER_BY_ID: (id) =>
      `[${ATTR_.MSG_ROLE}="assistant"][${ATTR_.MSG_ID}="${CSS.escape(id)}"],` +
      `[${ATTR_.MSG_ROLE}="assistant"][${ATTR_.LEGACY_HO_ID}="${CSS.escape(id)}"]`,
    ANSWER_CONTENT: () => `.markdown, .prose, [${ATTR_.TESTID}*="message-content"]`,
    USER: () => `[${ATTR_.MSG_ROLE}="user"]`,
    CONV_TURN: () => `[${ATTR_.TESTID}="conversation-turn"]`,
    MINIMAP_ROOT_SEL: () => `[data-cgxui="mnmp-minimap"][data-cgxui-owner="mnmp"]`,
    MINIMAP: () => document.querySelector(`[data-cgxui="mnmp-minimap"][data-cgxui-owner="mnmp"]`),
    MINIMAP_TOGGLE: () => document.querySelector(`[data-cgxui="mnmp-toggle"][data-cgxui-owner="mnmp"]`),
    MINIMAP_BTN_SEL: () => `[data-cgxui="mnmp-btn"][data-cgxui-owner="mnmp"]`,
    MINIMAP_WRAP_SEL: () => `[data-cgxui="mnmp-wrap"][data-cgxui-owner="mnmp"]`,
    MINIMAP_GUTTER_SEL: () => `.cgxui-mm-gutter`,
    MINIMAP_GUTTER_SYM_SEL: () => `.cgxui-mm-gutterSym`,
    MINIMAP_BTN: () => Array.from(document.querySelectorAll(`[data-cgxui="mnmp-btn"][data-cgxui-owner="mnmp"]`)),
    MINIMAP_WRAP: () => Array.from(document.querySelectorAll(`[data-cgxui="mnmp-wrap"][data-cgxui-owner="mnmp"]`)),
    MINIMAP_BTN_BY_ID: (id) => `[data-cgxui="mnmp-btn"][data-cgxui-owner="mnmp"][${ATTR_.DATA_ID}="${CSS.escape(id)}"]`,
    STRIP_UNDER_UI: () =>
      '.ho-under-ui, .ho-save-md, .ho-nav-box, .ho-minimap, .ho-mm-dotrow, .ho-mm-dl,' +
      '[data-cgxui="mnmp-minimap"][data-cgxui-owner="mnmp"],' +
      '[data-cgxui="mnmp-dotrow"][data-cgxui-owner="mnmp"],' +
      '[data-cgxui="mnmp-wrap"][data-cgxui-owner="mnmp"],' +
      '[data-cgxui="mnmp-btn"][data-cgxui-owner="mnmp"],' +
      `.${CLS_.DL_MARK}, .${CLS_.DL_MENU}, .${CLS_.DL_SELECT_ALL}`,
    DL_FORMAT_BTN: () => `.${CLS_.DL_FORMAT_BTN}`,
    DL_TOGGLE: () => `.${CLS_.DL_TOGGLE}`,
    TOPBTN: () => `#${ID_.TOPBTN}`,
  });

  /* ───────────────────────────── 2) Vault ───────────────────────────── */
  const W = window;
  const D = document;
  const H2O = (W.H2O = W.H2O || Object.create(null));
  const MOD_OBJ = ((H2O[TOK] = H2O[TOK] || Object.create(null))[BrID] = (H2O[TOK][BrID] || Object.create(null)));

  MOD_OBJ.meta = MOD_OBJ.meta || {
    tok: TOK, pid: PID, brid: BrID, dsid: DsID, skid: SkID, cid: CID_UP, modtag: MODTAG, suite: SUITE, host: HOST
  };
  MOD_OBJ.diag = MOD_OBJ.diag || { t0: performance.now(), steps: [], errors: [], bufMax: 160, errMax: 30 };
  MOD_OBJ.state = MOD_OBJ.state || Object.create(null);

  const R = MOD_OBJ.state;

  /* ───────────────────────────── 3) Runtime state ───────────────────────────── */
  R.isDownloadMode = false;
  R.allSelected = false;
  // Formats: md | html | pdf | docx (real) | doc (legacy)
  R.currentFormat = 'md';
  R.selectedIds = new Set();

  R.menuEl = null;
  R.topBtn = null;
  R.selectAllBtn = null;

  // Overlay marks live OUTSIDE minimap DOM (prevents squeezing / shifting)
  R.dlLayer = null;               // fixed overlay container
  R.dlMarkById = new Map();       // id -> button
  R.wrapById = new Map();         // id -> minimap wrap (optional)

  // Ephemeral ids when message-id is missing
  R.idByEl = new WeakMap();
  R.nextEphemeral = 1;

  // Cleanup registry
  R.cleanups = [];

  R.exportWatcher = null;
  R.exportControlFallback = false;
  R.fallbackTimer = null;
  R.controlMissingSince = 0;

  // Throttle positioning
  R.rafPos = 0;

  /* ───────────────────────────── 4) CSS ───────────────────────────── */
  /** @core Injects style once (idempotent). */
  function CORE_injectCssOnce() {
    if (document.getElementById(CSS_.STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = CSS_.STYLE_ID;
    style.setAttribute(ATTR_.CGXUI_OWNER, SkID);
    style.setAttribute(ATTR_.CGXUI, UI_.STYLE);

    // NOTE: cgxui-only UI hooks.
    style.textContent = `
/* ${EMOJI_HDR} ${MODICON} ${MODTAG} — Export UI (MiniMap selection) */

/* ✅ Overlay layer: marks are fixed-positioned, so they don't affect MiniMap layout */
.${CLS_.DL_LAYER} {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
}

/* Tiny selection circle next to each MiniMap box in download mode (fixed overlay) */
.${CLS_.DL_MARK} {
  position: fixed;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 1px solid rgba(148,163,184,0.72);
  background: transparent;
  box-shadow: 0 1px 2px rgba(2,6,23,0.25);
  color: transparent;
  font-size: 0;
  line-height: 0;
  display: none;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transform: translateY(-50%);
  pointer-events: auto;
  transition:
    opacity .12s ease,
    border-color .12s ease,
    box-shadow .12s ease,
    transform .08s ease;
}
.${CLS_.DL_MARK}:hover {
  border-color: rgba(203,213,225,0.82);
}
.${CLS_.DL_MARK}.${CLS_.STATE_SELECTED} {
  background: rgba(34,197,94,0.28);
  border-color: rgba(34,197,94,0.86);
  box-shadow: 0 1px 3px rgba(22,163,74,0.28);
}

/* Visible only when Export mode is active */
.${CLS_.DL_LAYER}.${CLS_.STATE_ACTIVE} .${CLS_.DL_MARK} {
  display: flex;
  opacity: 1;
}

/* 🔘 Floating container for Export button */
#${ID_.TOPBTN_WRAP} {
  position: fixed;
  top: 12px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 1px;
  z-index: 2147483645;
}

/* 🔘 Topbar Export button */
#${ID_.TOPBTN},
.${CLS_.DL_TOGGLE} {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 10px;
  min-height: 32px;
  height: 32px;
  margin-left: 2px !important;
  border-radius: 8px;
  box-sizing: border-box;
  border: none;
  outline: none;
  background: rgba(255, 255, 255, 0.035);
  box-shadow:
    inset 0 0 2px rgba(255,255,255,0.03),
    0 2px 4px rgba(0,0,0,0.2);
  font: 500 13px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 0.2px;
  text-shadow: 0 0 2px rgba(0,0,0,0.2);
  cursor: pointer;
  background-clip: padding-box;
  transition: all 0.2s ease;
}
#${ID_.TOPBTN}:hover,
.${CLS_.DL_TOGGLE}:hover {
  filter: brightness(1.15);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.07),
    0 3px 6px rgba(255, 215, 0, 0.2);
}
#${ID_.TOPBTN}.${CLS_.STATE_ACTIVE},
.${CLS_.DL_TOGGLE}.${CLS_.STATE_ACTIVE} {
  filter: brightness(1.25);
  color: rgba(255, 255, 255, 0.85);
  box-shadow:
    inset 0 0 3px rgba(255, 255, 255, 0.10),
    0 3px 8px rgba(255, 215, 0, 0.35);
}
#${ID_.TOPBTN} span,
.${CLS_.DL_TOGGLE} span { pointer-events: none; line-height: 1; }

/* Floating “select all answers” dot near MiniMap toggle */
.${CLS_.DL_SELECT_ALL} {
  position: fixed;
  z-index: 2147483647;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 1px solid rgba(148,163,184,0.7);
  background: rgba(15,23,42,0.96);
  color: rgba(226,232,240,0.95);
  font-size: 13px;
  display: none;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 5px rgba(0,0,0,0.5);
  transition:
    background .15s ease,
    border-color .15s ease,
    box-shadow .15s ease,
    transform .08s ease;
}
.${CLS_.DL_SELECT_ALL}::before { content: "✓"; }
.${CLS_.DL_SELECT_ALL}:hover { background: rgba(34,197,94,0.2); }
.${CLS_.DL_SELECT_ALL}.${CLS_.STATE_ACTIVE} {
  background: rgba(34,197,94,0.85);
  border-color: rgba(22,163,74,1);
  color: #02140a;
}

/* Floating dropdown under Export button */
.${CLS_.DL_MENU} {
  position: fixed;
  z-index: 2147483646;
  min-width: 220px;
  max-width: 300px;
  padding: 8px 0 6px;
  background: rgba(12,18,32,0.92);
  border-radius: 14px;
  border: 1px solid rgba(148,163,184,0.5);
  box-shadow: 0 18px 60px rgba(0,0,0,0.6);
  backdrop-filter: blur(14px);
  transform-origin: top;
  opacity: 0;
  pointer-events: none;
  transform: translateY(4px) scale(0.97);
  transition: opacity .14s ease, transform .14s ease;
}
.${CLS_.DL_MENU}.${CLS_.STATE_OPEN} {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
}
.${CLS_.DL_MENU_SECTION} {
  padding: 0 10px 6px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: rgba(148,163,184,0.9);
}
.${CLS_.DL_FORMAT_ROW} {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 0 10px 8px;
}
.${CLS_.DL_FORMAT_BTN} {
  width: auto;
  min-width: 72px;
  padding: 6px 8px;
  border-radius: 999px;
  border: 1px solid rgba(51,65,85,0.9);
  background: rgba(15,23,42,0.95);
  color: rgba(226,232,240,0.9);
  font-size: 12px;
  cursor: pointer;
  transition: background .12s ease, border-color .12s ease, color .12s ease;
}
.${CLS_.DL_FORMAT_BTN}:hover { transform: translateY(-1px); }
.${CLS_.DL_FORMAT_BTN}.${CLS_.STATE_ACTIVE} {
  background: rgba(30,64,175,0.9);
  border-color: rgba(59,130,246,1);
  color: #e5f0ff;
}
.${CLS_.DL_MENU_ITEM} {
  width: 100%;
  padding: 7px 12px;
  background: transparent;
  border: 0;
  color: rgba(226,232,240,0.96);
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  text-align: left;
}
.${CLS_.DL_ICON} { width: 18px; display: inline-flex; align-items: center; justify-content: center; }
.${CLS_.DL_ICON} svg { display: block; width: 18px; height: 18px; }
.${CLS_.DL_MENU_ITEM}:hover { background: rgba(30,64,175,0.55); }
.${CLS_.DL_MENU_SEP} { margin: 5px 0; border-top: 1px solid rgba(51,65,85,0.95); }
`;
    document.head.appendChild(style);
  }

  function DOM_ensureTopbarDock() {
    let wrap = document.getElementById(ID_.TOPBTN_WRAP);
    if (wrap) return wrap;

    wrap = document.createElement('div');
    wrap.id = ID_.TOPBTN_WRAP;
    wrap.setAttribute(ATTR_.CGXUI_OWNER, SkID);
    wrap.style.position = 'fixed';
    wrap.style.top = '12px';
    wrap.style.left = 'auto';
    wrap.style.right = '16px';
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '4px';
    wrap.style.zIndex = '2147483645';
    wrap.style.pointerEvents = 'none';
    wrap.style.opacity = '0';
    wrap.style.visibility = 'hidden';
    wrap.style.transition = 'opacity .12s ease';
    wrap.dataset.cgxuiReady = '0';
    wrap.dataset.cgxuiFallback = '0';

    document.body.appendChild(wrap);
    return wrap;
  }

  /* ───────────────────────────── 5) Small helpers ───────────────────────────── */
  /** @helper */
  function CLEAN_add(fn) { if (typeof fn === 'function') R.cleanups.push(fn); }

  /** @helper */
  function UTIL_on(target, type, handler, options) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    CLEAN_add(() => { try { target.removeEventListener(type, handler, options); } catch {} });
  }

  /** @helper */
  function UTIL_emit(evt, detail) {
    try { W.dispatchEvent(new CustomEvent(evt, { detail, bubbles: true, composed: true })); } catch {}
  }

  /** @helper */
  function UTIL_now() { return Date.now(); }

  /** @helper */
  function UTIL_qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

  /** @helper */
  function UTIL_getMessageId(el) {
    if (!el) return null;
    const fromAttr =
      el.getAttribute(ATTR_.MSG_ID) ||
      el.dataset.messageId ||
      el.getAttribute(ATTR_.LEGACY_HO_ID);
    if (fromAttr) return fromAttr;

    let eph = R.idByEl.get(el);
    if (!eph) {
      eph = `h2o-ephemeral-${PID}-${R.nextEphemeral++}`;
      R.idByEl.set(el, eph);
    }
    return eph;
  }

  /** @helper */
  function UTIL_getAnswerContent(el) {
    return el?.querySelector?.(SEL_.ANSWER_CONTENT()) || el;
  }

  /** @helper */
  function UTIL_stripUnderUI(clone) {
    clone?.querySelectorAll?.(SEL_.STRIP_UNDER_UI())?.forEach?.(n => n.remove());
    return clone;
  }

  /** @helper */
  function UTIL_plainText(msgEl) {
    if (!msgEl) return '';
    const block = UTIL_getAnswerContent(msgEl);
    const clone = block.cloneNode(true);
    UTIL_stripUnderUI(clone);
    return (clone.innerText || '').trim();
  }

  /** @helper */
  function UTIL_downloadTextFile(filename, content, mime = 'text/markdown;charset=utf-8') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }

  /** @helper */
  function UTIL_downloadBlobFile(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 0);
  }

  /** @helper Convert a minimal HTML export to a “Word-friendly” .doc file.
   *  NOTE: This is not a true .docx package (no JSZip/docx lib here),
   *  but Word opens this reliably.
   */
  function UTIL_wrapHtmlForWord(htmlBody, title) {
    const safeTitle = UTIL_escHtml(title || 'ChatGPT Export');
    return [
      '<!doctype html><html><head><meta charset="utf-8">',
      '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">',
      `<title>${safeTitle}</title>`,
      '</head><body>',
      String(htmlBody || ''),
      '</body></html>'
    ].join('');
  }

  /** @helper */
  function UTIL_escHtml(str) {
    return String(str || '').replace(/[&<>"]/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;'
    }[c] || c));
  }

  /** @helper */
  function UTIL_getCreationDate(msgEl) {
    if (typeof W.getCreationDate === 'function') return W.getCreationDate(msgEl);
    const timeEl = msgEl?.querySelector?.(`time[${ATTR_.DATETIME}]`) ||
      msgEl?.closest?.(SEL_.CONV_TURN())?.querySelector?.(`time[${ATTR_.DATETIME}]`);
    if (timeEl?.getAttribute?.(ATTR_.DATETIME)) {
      const d = new Date(timeEl.getAttribute(ATTR_.DATETIME));
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  /* ───────────────────────────── 6) Q/A lookup ───────────────────────────── */
  /** @helper */
  function DATA_answers() { return Array.from(document.querySelectorAll(SEL_.ANSWER())); }

  /** @helper */
  function DATA_answerById(id) {
    if (!id) return null;
    try { return document.querySelector(SEL_.ANSWER_BY_ID(id)); } catch { return null; }
  }

  /** @helper Resolve any MiniMap/export id to a real assistant message id when possible. */
  function DATA_answerIdFromAnyId(id) {
    const key = String(id || '').trim();
    if (!key) return '';

    const direct = DATA_answerById(key);
    if (direct) return String(UTIL_getMessageId(direct) || key);

    let mmBtn = null;
    try { mmBtn = document.querySelector(SEL_.MINIMAP_BTN_BY_ID(key)); } catch {}
    if (!mmBtn) {
      const wrap = R.wrapById.get(key);
      if (wrap?.isConnected) {
        mmBtn = wrap.matches?.(SEL_.MINIMAP_BTN_SEL())
          ? wrap
          : (wrap.querySelector?.(SEL_.MINIMAP_BTN_SEL()) || null);
      }
    }
    const viaBtn = String(mmBtn?.dataset?.primaryAId || '').trim();
    if (viaBtn) return viaBtn;

    const turnMap = window.H2O_MM_turnById;
    if (turnMap instanceof Map) {
      const viaTurn = String(turnMap.get(key)?.answerId || '').trim();
      if (viaTurn) return viaTurn;
    }

    if (key.startsWith('turn:')) {
      const maybe = String(key.slice(5) || '').trim();
      if (maybe) return maybe;
    }
    return key;
  }

  /** @helper */
  function DATA_exportIdsFromSelection() {
    const out = [];
    const seen = new Set();
    for (const rawId of R.selectedIds) {
      const answerId = DATA_answerIdFromAnyId(rawId);
      if (!answerId || seen.has(answerId)) continue;
      seen.add(answerId);
      out.push(answerId);
    }
    return out;
  }

  /** @helper */
  function DATA_userForAnswer(answerEl) {
    if (!answerEl) return null;
    const turn = answerEl.closest?.(SEL_.CONV_TURN());
    if (turn) {
      let t = turn.previousElementSibling;
      while (t) {
        const userMsg = t.querySelector?.(SEL_.USER());
        if (userMsg) return userMsg;
        t = t.previousElementSibling;
      }
    }
    let node = answerEl;
    while (node) {
      let prev = node.previousElementSibling;
      while (prev) {
        if (prev.matches?.(SEL_.USER())) return prev;
        const inner = prev.querySelector?.(SEL_.USER());
        if (inner) return inner;
        prev = prev.previousElementSibling;
      }
      node = node.parentElement;
    }
    return null;
  }

  /** @helper */
  function DATA_buildSingleQABody(idx, qText, aText) {
    return [
      `# Q&A ${idx}`,
      '',
      `# Q ${idx}`,
      qText || '_(no user message found)_',
      '',
      `# A ${idx}`,
      aText || '_(empty answer)_',
      ''
    ].join('\n');
  }

  /* ───────────────────────────── 7) Export: Markdown ───────────────────────────── */
  /** @critical */
  function EXPORT_one_md(id) {
    const aEl = DATA_answerById(id);
    if (!aEl) return;
    const qEl = DATA_userForAnswer(aEl);
    const qText = UTIL_plainText(qEl);
    const aText = UTIL_plainText(aEl);

    const answers = DATA_answers();
    const idx = Math.max(1, answers.findIndex(el => UTIL_getMessageId(el) === id) + 1);
    const idxStr = String(idx).padStart(3, '0');

    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const filename = `${yyyy}-${mm}-${dd}_QA_${idxStr}.md`;

    UTIL_downloadTextFile(filename, DATA_buildSingleQABody(idx, qText, aText));
  }

  /** @critical */
  function EXPORT_bundle_md(ids) {
    const answers = DATA_answers();
    const idToIndex = new Map();
    answers.forEach((el, idx) => {
      const mid = UTIL_getMessageId(el);
      if (mid) idToIndex.set(mid, idx);
    });

    const sorted = (ids || []).slice().sort((a, b) => (idToIndex.get(a) ?? 99999) - (idToIndex.get(b) ?? 99999));
    const parts = [];
    for (const id of sorted) {
      const aEl = DATA_answerById(id);
      if (!aEl) continue;
      const qEl = DATA_userForAnswer(aEl);
      const qText = UTIL_plainText(qEl);
      const aText = UTIL_plainText(aEl);
      const idx = (idToIndex.get(id) ?? 0) + 1;
      parts.push(DATA_buildSingleQABody(idx, qText, aText), '---', '');
    }
    if (!parts.length) return;

    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const filename = `${yyyy}-${mm}-${dd}_QA_bundle_${sorted.length}.md`;

    UTIL_downloadTextFile(filename, parts.join('\n'));
  }

  /* ───────────────────────────── 7b) Export: HTML / DOC (legacy) ───────────────────────────── */
  /** @helper Build a simple standalone HTML document for selected Q&As. */
  function EXPORT_buildHtmlDoc(items, title) {
    const safeTitle = UTIL_escHtml(title || 'ChatGPT Q&A Export');
    const css = `
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#0b0b0b;color:#f5f5f5;font-family:system-ui,-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif}
body{max-width:980px;margin:24px auto;padding:0 16px}
h1{font-size:20px;margin:0 0 12px}
.meta{font-size:12px;opacity:.7;margin-bottom:18px}
.qa{margin:14px 0;padding:14px 14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}
.qa-h{display:flex;justify-content:space-between;gap:12px;margin-bottom:10px}
.qa-title{font-weight:700}
.qa-stamp{font-size:12px;opacity:.7}
.blk{margin:10px 0}
.lbl{font-size:11px;letter-spacing:.06em;text-transform:uppercase;opacity:.8;margin-bottom:6px}
.txt{white-space:pre-wrap;line-height:1.55;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:10px 12px}
`;

    const parts = [];
    parts.push('<!doctype html><html><head><meta charset="utf-8">');
    parts.push(`<title>${safeTitle}</title>`);
    parts.push('<style>', css, '</style>');
    parts.push('</head><body>');
    parts.push(`<h1>${safeTitle}</h1>`);
    parts.push(`<div class="meta">Exported: ${UTIL_escHtml(new Date().toISOString())}</div>`);

    for (const it of (items || [])) {
      parts.push('<section class="qa">');
      parts.push('<div class="qa-h">');
      parts.push(`<div class="qa-title">Q&amp;A ${UTIL_escHtml(String(it.idx || ''))}</div>`);
      parts.push(it.stamp ? `<div class="qa-stamp">${UTIL_escHtml(it.stamp)}</div>` : '<div></div>');
      parts.push('</div>');
      parts.push('<div class="blk"><div class="lbl">Question</div>');
      parts.push(`<div class="txt">${UTIL_escHtml(it.qText || '')}</div></div>`);
      parts.push('<div class="blk"><div class="lbl">Answer</div>');
      parts.push(`<div class="txt">${UTIL_escHtml(it.aText || '')}</div></div>`);
      parts.push('</section>');
    }

    parts.push('</body></html>');
    return parts.join('');
  }

  /** @critical */
  function EXPORT_one_html(id) {
    const items = EXPORT_buildQAData([id]);
    if (!items.length) return;
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const idxStr = String(items[0]?.idx || 1).padStart(3, '0');
    const filename = `${yyyy}-${mm}-${dd}_QA_${idxStr}.html`;
    UTIL_downloadTextFile(filename, EXPORT_buildHtmlDoc(items, `ChatGPT Q&A ${items[0]?.idx || ''}`), 'text/html;charset=utf-8');
  }

  /** @critical */
  function EXPORT_bundle_html(ids) {
    const items = EXPORT_buildQAData(ids);
    if (!items.length) return;
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const filename = `${yyyy}-${mm}-${dd}_QA_bundle_${items.length}.html`;
    UTIL_downloadTextFile(filename, EXPORT_buildHtmlDoc(items, 'ChatGPT Q&A Export'), 'text/html;charset=utf-8');
  }

  /** @critical Word export (HTML wrapped as .doc). */
  function EXPORT_one_doc(id) {
    const items = EXPORT_buildQAData([id]);
    if (!items.length) return;
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const idxStr = String(items[0]?.idx || 1).padStart(3, '0');
    const filename = `${yyyy}-${mm}-${dd}_QA_${idxStr}.doc`;
    const html = EXPORT_buildHtmlDoc(items, `ChatGPT Q&A ${items[0]?.idx || ''}`);
    UTIL_downloadTextFile(filename, UTIL_wrapHtmlForWord(html, `ChatGPT Q&A ${items[0]?.idx || ''}`), 'application/msword;charset=utf-8');
  }

  /** @critical Word export (HTML wrapped as .doc). */
  function EXPORT_bundle_docx(ids) {
    const items = EXPORT_buildQAData(ids);
    if (!items.length) return;

    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const filename = `${yyyy}-${mm}-${dd}_QA_bundle_${items.length}.docx`;

    // Prefer shared H2O exporter if present (keeps system consistent)
    const H2Oexp = window.H2O?.export;
    if (H2Oexp && typeof H2Oexp.downloadDOCXReal === 'function') {
      const snapshot = {
        schema: 'H2O.archive.v1',
        chatId: (window.H2O?.util?.getChatId?.() || 'unknown'),
        capturedAt: new Date().toISOString(),
        href: location.href,
        messages: []
      };
      for (const it of items) {
        snapshot.messages.push({ id:'', role:'user', text: it.q || '', create_time: null });
        snapshot.messages.push({ id:'', role:'assistant', text: it.a || '', create_time: null });
      }
      H2Oexp.downloadDOCXReal(snapshot, filename, 'ChatGPT Q&A Export');
      return;
    }

    const htmlDocx = window.htmlDocx;
    if (!htmlDocx || typeof htmlDocx.asBlob !== 'function') {
      alert('DOCX exporter not available (missing html-docx-js).');
      return;
    }
    const html = EXPORT_buildHtmlDoc(items, 'ChatGPT Q&A Export');
    const full = UTIL_wrapHtmlForWord(html, 'ChatGPT Q&A Export'); // full HTML
    const blob = htmlDocx.asBlob(String(full || ''));
    UTIL_downloadBlobFile(filename, blob);
  }

  function EXPORT_bundle_doc(ids) {
    const items = EXPORT_buildQAData(ids);
    if (!items.length) return;
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const filename = `${yyyy}-${mm}-${dd}_QA_bundle_${items.length}.doc`;
    const html = EXPORT_buildHtmlDoc(items, 'ChatGPT Q&A Export');
    UTIL_downloadTextFile(filename, UTIL_wrapHtmlForWord(html, 'ChatGPT Q&A Export'), 'application/msword;charset=utf-8');
  }

  /* ───────────────────────────── 8) Export: PDF (print window) ───────────────────────────── */
  /** @helper */
  function EXPORT_buildQAData(ids) {
    const answers = DATA_answers();
    const idToIndex = new Map();
    answers.forEach((el, idx) => {
      const mid = UTIL_getMessageId(el);
      if (mid) idToIndex.set(mid, idx + 1);
    });

    return (ids || []).map(id => {
      const aEl = DATA_answerById(id);
      if (!aEl) return null;

      const qEl = DATA_userForAnswer(aEl);
      const qText = UTIL_plainText(qEl) || '(no user message found)';
      const aText = UTIL_plainText(aEl) || '(empty answer)';

      let stamp = '';
      const d = UTIL_getCreationDate(aEl);
      if (d && !isNaN(d.getTime())) {
        const pad = n => String(n).padStart(2, '0');
        stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }

      const idx = idToIndex.get(id) || 0;
      const hlName = (W.highlightMap || {})[id] || '';
      return { id, idx, qText, aText, stamp, hlName };
    }).filter(Boolean);
  }

  /** @critical */
  function EXPORT_printPdf(ids) {
    const items = EXPORT_buildQAData(ids);
    if (!items.length) { alert('No answers selected to export.'); return; }

    const win = window.open('', '_blank');
    if (!win) { alert('Popup blocked. Allow popups for chatgpt.com to export as PDF.'); return; }
    const doc = win.document;

    const css = `
*{box-sizing:border-box}
:root{--qa-font-scale:1}
html,body{margin:0;padding:0;background:#0b0b0b;color:#f5f5f5;font-family:system-ui,-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif}
body.qa-light{background:#f2f2f2;color:#111}
@page{size:A4;margin:20mm}
.qa-toolbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:8px;padding:8px 16px;background:rgba(10,10,10,.98);border-bottom:1px solid rgba(255,255,255,.08)}
body.qa-light .qa-toolbar{background:rgba(245,245,245,.98);border-bottom-color:rgba(0,0,0,.06);color:#111}
.qa-toolbar-title{font-size:14px;font-weight:500;margin-right:auto;opacity:.8}
.qa-toolbar button{border-radius:999px;padding:4px 10px;font-size:12px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:4px;border:1px solid rgba(255,255,255,.15);background:rgba(30,30,30,.95);color:#f5f5f5;transition:background .15s ease,border-color .15s ease,transform .08s ease}
.qa-toolbar button:hover{background:rgba(45,45,45,1);border-color:rgba(255,255,255,.25);transform:translateY(-.5px)}
body.qa-light .qa-toolbar button{background:rgba(255,255,255,.9);color:#111;border-color:rgba(0,0,0,.15)}
body.qa-light .qa-toolbar button:hover{background:#fff;border-color:rgba(0,0,0,.25)}
.qa-container{padding:12mm 18mm}
.qa{page-break-after:always;padding:4mm 0 6mm;border-left:4px solid transparent}
.qa:last-child{page-break-after:auto}
.qa-header{font-size:14px;font-weight:600;margin-bottom:3mm;display:flex;justify-content:space-between;align-items:baseline}
.qa-meta{font-size:11px;opacity:.7}
.qa-title{font-size:13px;margin:0}
.qa-block{margin-bottom:3mm}
.qa-block-title{font-size:12px;font-weight:600;margin:0 0 1.5mm;letter-spacing:.04em;text-transform:uppercase;opacity:.8}
.qa-text{font-size:calc(12px * var(--qa-font-scale));line-height:1.5;white-space:pre-wrap;background:#151515;color:#f5f5f5;border-radius:6px;padding:3mm 4mm;border:1px solid rgba(255,255,255,.06)}
body.qa-light .qa-text{background:#fff;color:#111;border-color:rgba(0,0,0,.06)}
.qa[${ATTR_.HL}="gold"]{border-left-color:#FFC107}
.qa[${ATTR_.HL}="red"]{border-left-color:#FF4C4C}
.qa[${ATTR_.HL}="orange"]{border-left-color:#FF914D}
.qa[${ATTR_.HL}="green"]{border-left-color:#22C55E}
.qa[${ATTR_.HL}="blue"]{border-left-color:#3B82F6}
.qa[${ATTR_.HL}="pink"]{border-left-color:#F472B6}
.qa[${ATTR_.HL}="purple"]{border-left-color:#A855F7}
.qa[${ATTR_.HL}="sky"]{border-left-color:#7DD3FC}
`;

    const html = [];
    html.push(
      '<!doctype html><html><head><meta charset="utf-8">',
      '<title>ChatGPT Q&A Export</title>',
      '<style>', css, '</style>',
      '</head><body class="qa-dark">',
      '<div class="qa-toolbar">',
        '<div class="qa-toolbar-title">ChatGPT Q&A Export</div>',
        '<button id="qa-btn-print">🖨 Print</button>',
        '<button id="qa-btn-pdf">📄 PDF</button>',
        '<button id="qa-btn-font-dec">A-</button>',
        '<button id="qa-btn-font-inc">A+</button>',
        '<button id="qa-btn-theme">🌞 Light</button>',
      '</div>',
      '<div class="qa-container">'
    );

    for (const item of items) {
      html.push(
        `<section class="qa" ${ATTR_.HL}="${UTIL_escHtml(item.hlName)}">`,
          '<div class="qa-header">',
            `<div class="qa-title">Q&amp;A ${item.idx || ''}</div>`,
            item.stamp ? `<div class="qa-meta">${UTIL_escHtml(item.stamp)}</div>` : '',
          '</div>',
          '<div class="qa-block">',
            '<div class="qa-block-title">Question</div>',
            `<div class="qa-text" contenteditable="true">${UTIL_escHtml(item.qText)}</div>`,
          '</div>',
          '<div class="qa-block">',
            '<div class="qa-block-title">Answer</div>',
            `<div class="qa-text" contenteditable="true">${UTIL_escHtml(item.aText)}</div>`,
          '</div>',
        '</section>'
      );
    }

    html.push('</div></body></html>');
    doc.open(); doc.write(html.join('')); doc.close();

    win.addEventListener('load', () => {
      const wdoc = win.document;
      const root = wdoc.documentElement;
      const body = wdoc.body;

      const getScale = () => {
        const v = win.getComputedStyle(root).getPropertyValue('--qa-font-scale') || '1';
        return parseFloat(v) || 1;
      };
      const setScale = v => root.style.setProperty('--qa-font-scale', String(v));

      wdoc.getElementById('qa-btn-print')?.addEventListener('click', () => win.print());
      wdoc.getElementById('qa-btn-pdf')?.addEventListener('click', () => win.print());

      wdoc.getElementById('qa-btn-font-dec')?.addEventListener('click', () => setScale(Math.max(0.7, getScale() - 0.1)));
      wdoc.getElementById('qa-btn-font-inc')?.addEventListener('click', () => setScale(Math.min(1.8, getScale() + 0.1)));

      const btnTheme = wdoc.getElementById('qa-btn-theme');
      if (btnTheme) {
        btnTheme.textContent = '🌞 Light';
        btnTheme.addEventListener('click', () => {
          body.classList.toggle('qa-light');
          body.classList.toggle('qa-dark');
          btnTheme.textContent = body.classList.contains('qa-dark') ? '🌞 Light' : '🌗 Dark';
        });
      }
    });

    win.focus();
  }

  /* ───────────────────────────── 9) Router ───────────────────────────── */
  /** @critical */
  function EXPORT_one(id) {
    if (R.currentFormat === 'md') return EXPORT_one_md(id);
    if (R.currentFormat === 'html') return EXPORT_one_html(id);
    if (R.currentFormat === 'pdf') return EXPORT_printPdf([id]);
    if (R.currentFormat === 'doc') return EXPORT_one_doc(id);
  }
  /** @critical */
  function EXPORT_bundle(ids) {
    if (R.currentFormat === 'md') return EXPORT_bundle_md(ids);
    if (R.currentFormat === 'html') return EXPORT_bundle_html(ids);
    if (R.currentFormat === 'pdf') return EXPORT_printPdf(ids);
    if (R.currentFormat === 'docx') return EXPORT_bundle_docx(ids);
    if (R.currentFormat === 'doc') return EXPORT_bundle_doc(ids);
  }

  /* ───────────────────────────── 10) Overlay selection circles (outside MiniMap) ───────────────────────────── */
  /** @core */
  function UI_ensureDlLayer() {
    if (R.dlLayer && document.body.contains(R.dlLayer)) return R.dlLayer;
    const layer = document.createElement('div');
    layer.className = CLS_.DL_LAYER;
    layer.setAttribute(ATTR_.CGXUI_OWNER, SkID);
    layer.setAttribute(ATTR_.CGXUI, UI_.DL_LAYER);
    document.body.appendChild(layer);
    R.dlLayer = layer;
    return layer;
  }

  /** @helper */
  function UI_getDlMark(id) {
    UI_ensureDlLayer();
    const existing = R.dlMarkById.get(id);
    if (existing && R.dlLayer.contains(existing)) return existing;

    const btn = document.createElement('button');
    btn.className = CLS_.DL_MARK;
    btn.type = 'button';
    btn.textContent = '';
    btn.dataset.id = id;
    btn.setAttribute(ATTR_.CGXUI_OWNER, SkID);
    btn.setAttribute(ATTR_.CGXUI, UI_.DL_MARK);
    if (R.selectedIds.has(id)) btn.classList.add(CLS_.STATE_SELECTED);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Toggle selection
      if (R.selectedIds.has(id)) {
        R.selectedIds.delete(id);
        btn.classList.remove(CLS_.STATE_SELECTED);
      } else {
        R.selectedIds.add(id);
        btn.classList.add(CLS_.STATE_SELECTED);
      }
      // select-all state resets
      R.allSelected = false;
      if (R.selectAllBtn) R.selectAllBtn.classList.remove(CLS_.STATE_ACTIVE);
    });

    R.dlLayer.appendChild(btn);
    R.dlMarkById.set(id, btn);
    return btn;
  }

  /** @helper */
  function UI_hideDlMark(mark) {
    if (!mark) return;
    mark.style.display = 'none';
    mark.style.opacity = '0';
  }

  /** @helper Prefer aligning export circles to the MiniMap right-symbol center. */
  function UI_getRightSymbolAnchorRect(wrap) {
    if (!wrap || typeof wrap.querySelector !== 'function') return null;
    const gutter = wrap.querySelector(SEL_.MINIMAP_GUTTER_SEL());
    if (!gutter || !gutter.isConnected) return null;

    const sym = gutter.querySelector(SEL_.MINIMAP_GUTTER_SYM_SEL());
    if (sym && sym.isConnected) {
      const sr = sym.getBoundingClientRect();
      if (sr.width > 0 && sr.height > 0) return sr;
    }

    const gr = gutter.getBoundingClientRect();
    if (gr.width > 0 && gr.height > 0) return gr;
    return null;
  }

  /** @critical Position one mark to the RIGHT of its MiniMap box (outside). */
  function UI_positionDlMark(id, sourceBtn = null) {
    const mark = UI_getDlMark(id);
    if (!mark) return;

    const panel = SEL_.MINIMAP();
    if (!R.isDownloadMode || !panel || !panel.isConnected) {
      UI_hideDlMark(mark);
      return;
    }

    const panelRect = panel.getBoundingClientRect();
    if (panelRect.width <= 0 || panelRect.height <= 0) {
      UI_hideDlMark(mark);
      return;
    }

    // Resolve target rect:
    // 1) exact source button from current scan
    // 2) legacy cached wrap (if MiniMap calls attachDownloadCheck)
    // 3) fallback query by data-id
    let wrap = null;
    if (sourceBtn?.isConnected) {
      wrap = sourceBtn.closest?.(SEL_.MINIMAP_WRAP_SEL()) || sourceBtn;
    }
    if (!wrap || !document.body.contains(wrap)) {
      const cached = R.wrapById.get(id) || null;
      if (cached?.isConnected) wrap = cached;
    }
    if (!wrap || !document.body.contains(wrap)) {
      const btn = document.querySelector(SEL_.MINIMAP_BTN_BY_ID(id));
      if (btn?.isConnected) wrap = btn.closest?.(SEL_.MINIMAP_WRAP_SEL()) || btn;
    }

    if (!wrap) {
      UI_hideDlMark(mark);
      return;
    }

    const r = wrap.getBoundingClientRect();
    const fallbackCy = (r.top + r.height / 2);
    const anchorRect = UI_getRightSymbolAnchorRect(wrap);
    const anchorCx = anchorRect ? (anchorRect.left + (anchorRect.width / 2)) : (r.right + 13.5);
    const anchorCy = anchorRect ? (anchorRect.top + (anchorRect.height / 2)) : fallbackCy;

    const visibleInPanel =
      anchorCy >= panelRect.top + 1 &&
      anchorCy <= panelRect.bottom - 1 &&
      r.right >= panelRect.left &&
      r.left <= panelRect.right;

    if (!visibleInPanel) {
      UI_hideDlMark(mark);
      return;
    }

    const markHalfW = 8;
    const x = Math.round((anchorCx - markHalfW) * 2) / 2; // center circle over right symbol slot
    const y = Math.round(anchorCy);                      // vertically centered

    mark.style.left = `${x}px`;
    mark.style.top = `${y}px`;
    mark.style.display = 'flex';
    mark.style.opacity = '1';

    mark.classList.toggle(CLS_.STATE_SELECTED, R.selectedIds.has(id));
  }

  /** @critical */
  function UI_positionAllMarks() {
    if (!R.isDownloadMode) {
      for (const mark of R.dlMarkById.values()) {
        UI_hideDlMark(mark);
      }
      return;
    }

    const panel = SEL_.MINIMAP();
    if (!panel) {
      for (const mark of R.dlMarkById.values()) UI_hideDlMark(mark);
      return;
    }

    const btns = Array.from(panel.querySelectorAll(SEL_.MINIMAP_BTN_SEL()));
    const seen = new Set();
    for (const b of btns) {
      const id = b?.dataset?.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      UI_positionDlMark(id, b);
    }

    // Hide stale marks that no longer belong to a visible MiniMap button.
    for (const [id, mark] of R.dlMarkById.entries()) {
      if (!seen.has(id)) UI_hideDlMark(mark);
    }

    // Drop disconnected legacy wrap refs to avoid stale geometry reads.
    for (const [id, wrap] of R.wrapById.entries()) {
      if (!wrap || !wrap.isConnected) R.wrapById.delete(id);
    }
  }

  function UI_hideExportWrap(wrap) {
    if (!wrap) return;
    wrap.style.opacity = '0';
    wrap.style.visibility = 'hidden';
    wrap.style.pointerEvents = 'none';
    wrap.dataset.cgxuiReady = '0';
  }

  function UI_showExportWrap(wrap) {
    if (!wrap) return;
    wrap.style.opacity = '1';
    wrap.style.visibility = 'visible';
    wrap.style.pointerEvents = 'auto';
    wrap.dataset.cgxuiReady = '1';
  }

  function UI_positionExportButton() {
    const wrap = document.getElementById(ID_.TOPBTN_WRAP);
    if (!wrap) return;
    const control = document.querySelector(CONTROL_BTN_SELECTOR);
    if (control && R.fallbackTimer) {
      clearTimeout(R.fallbackTimer);
      R.fallbackTimer = null;
    }
    const now = Date.now();
    if (!control) {
      if (!R.controlMissingSince) R.controlMissingSince = now;
      const missingForMs = now - R.controlMissingSince;
      const fallback = R.exportControlFallback || missingForMs >= EXPORT_CONTROL_WAIT_MS;
      if (missingForMs >= EXPORT_CONTROL_WAIT_MS) R.exportControlFallback = true;
      wrap.dataset.cgxuiFallback = fallback ? '1' : '0';
      if (!fallback) {
        UI_hideExportWrap(wrap);
        return;
      }
      wrap.style.left = 'auto';
      wrap.style.right = '16px';
      wrap.style.top = '12px';
      UI_showExportWrap(wrap);
      return;
    }
    R.controlMissingSince = 0;
    R.exportControlFallback = false;
    wrap.dataset.cgxuiFallback = '0';
    const rect = control.getBoundingClientRect();
    wrap.style.left = `${Math.round(rect.right + 4)}px`;
    wrap.style.top = `${Math.round(rect.top)}px`;
    wrap.style.right = 'auto';
    UI_showExportWrap(wrap);
  }

  /** @helper */
  function UI_scheduleReposition() {
    if (R.rafPos) return;
    R.rafPos = requestAnimationFrame(() => {
      R.rafPos = 0;
      UI_positionAllMarks();
      UI_positionSelectAllBtn();
      UI_positionExportButton();
    });
  }

  function UI_startExportWatcher() {
    if (R.exportWatcher) return;
    UI_positionExportButton();
    R.exportWatcher = setInterval(UI_positionExportButton, 400);
    CLEAN_add(() => {
      if (R.exportWatcher) {
        clearInterval(R.exportWatcher);
        R.exportWatcher = null;
      }
    });

    if (R.fallbackTimer) {
      clearTimeout(R.fallbackTimer);
      R.fallbackTimer = null;
    }
    R.fallbackTimer = setTimeout(() => {
      R.exportControlFallback = true;
      const wrap = document.getElementById(ID_.TOPBTN_WRAP);
      if (wrap) wrap.dataset.cgxuiFallback = '1';
      UI_positionExportButton();
    }, EXPORT_CONTROL_WAIT_MS);
    CLEAN_add(() => {
      if (R.fallbackTimer) {
        clearTimeout(R.fallbackTimer);
        R.fallbackTimer = null;
      }
    });
  }

  /* Legacy hook used by MiniMap script (it can call this while building wraps). */
  /** @core */
  function API_attachDownloadCheck(wrap, id) {
    if (!wrap || !id) return;
    R.wrapById.set(id, wrap);
    UI_getDlMark(id);
    if (R.isDownloadMode) UI_positionDlMark(id);
  }

  /* ───────────────────────────── 11) Select-all dot near MiniMap toggle ───────────────────────────── */
  /** @core */
  function UI_ensureSelectAllBtn() {
    if (R.selectAllBtn && document.body.contains(R.selectAllBtn)) return R.selectAllBtn;
    const btn = document.createElement('button');
    btn.className = CLS_.DL_SELECT_ALL;
    btn.type = 'button';
    btn.title = 'Click: select/deselect all. Double-click: clear selection and exit';
    btn.setAttribute(ATTR_.CGXUI_OWNER, SkID);
    btn.setAttribute(ATTR_.CGXUI, UI_.DL_SELECT_ALL);
    document.body.appendChild(btn);
    R.selectAllBtn = btn;

    let clickTimer = 0;
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      // Delay single-click so dblclick can cancel it cleanly.
      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        clickTimer = 0;
        const target = !R.allSelected;
        ACT_applySelectAll(target);
      }, 220);
    });

    btn.addEventListener('dblclick', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = 0;
      }
      ACT_clearSelectionsAndExit();
      UI_hideMenu();
    });

    return btn;
  }

  /** @critical */
  function UI_positionSelectAllBtn() {
    const btn = R.selectAllBtn;
    if (!btn) return;

    const toggle = SEL_.MINIMAP_TOGGLE();
    if (!toggle || !R.isDownloadMode) {
      btn.style.display = 'none';
      return;
    }

    const r = toggle.getBoundingClientRect();
    btn.style.display = 'flex';
    btn.style.top = `${Math.round(window.scrollY + r.top + r.height / 2 - 10)}px`;
    btn.style.left = `${Math.round(window.scrollX + r.right + 2)}px`;
    btn.classList.toggle(CLS_.STATE_ACTIVE, !!R.allSelected);
  }

  /* ───────────────────────────── 12) Menu ───────────────────────────── */
  /** @core */
  function UI_ensureMenu(anchorBtn) {
    if (!R.menuEl || !document.body.contains(R.menuEl)) {
      const menu = document.createElement('div');
      menu.className = CLS_.DL_MENU;
      menu.setAttribute(ATTR_.CGXUI_OWNER, SkID);
      menu.setAttribute(ATTR_.CGXUI, UI_.DL_MENU);
      menu.innerHTML = `
        <div class="${CLS_.DL_MENU_SECTION}" data-cgxui-owner="${SkID}" data-cgxui="${UI_.DL_MENU_SECTION}">Format</div>
        <div class="${CLS_.DL_FORMAT_ROW}" data-cgxui-owner="${SkID}" data-cgxui="${UI_.DL_FORMAT_ROW}">
          <button class="${CLS_.DL_FORMAT_BTN}" ${ATTR_.FMT}="md" data-cgxui-owner="${SkID}" data-cgxui="${UI_.DL_FORMAT_BTN}">Markdown</button>
          <button class="${CLS_.DL_FORMAT_BTN}" ${ATTR_.FMT}="html" data-cgxui-owner="${SkID}" data-cgxui="${UI_.DL_FORMAT_BTN}">HTML</button>
          <button class="${CLS_.DL_FORMAT_BTN}" ${ATTR_.FMT}="pdf" data-cgxui-owner="${SkID}" data-cgxui="${UI_.DL_FORMAT_BTN}">PDF</button>
          <button class="${CLS_.DL_FORMAT_BTN}" ${ATTR_.FMT}="docx" data-cgxui-owner="${SkID}" data-cgxui="${UI_.DL_FORMAT_BTN}">DOCX</button>
          <button class="${CLS_.DL_FORMAT_BTN}" ${ATTR_.FMT}="doc" data-cgxui-owner="${SkID}" data-cgxui="${UI_.DL_FORMAT_BTN}">DOC (legacy)</button>
        </div>
        <div class="${CLS_.DL_MENU_SEP}" data-cgxui-owner="${SkID}" data-cgxui="${UI_.DL_MENU_SEP}"></div>
        <button class="${CLS_.DL_MENU_ITEM}" ${ATTR_.MODE}="one" data-cgxui-owner="${SkID}" data-cgxui="${UI_.DL_MENU_ITEM}">
          <span class="${CLS_.DL_ICON}" data-cgxui-owner="${SkID}" data-cgxui="${UI_.DL_ICON}">${ICON_.ONE}</span>
          <span data-cgxui-owner="${SkID}" data-cgxui="${UI_.DL_TEXT}">Download selected as <b>one</b> file</span>
        </button>
        <button class="${CLS_.DL_MENU_ITEM}" ${ATTR_.MODE}="multi" data-cgxui-owner="${SkID}" data-cgxui="${UI_.DL_MENU_ITEM}">
          <span class="${CLS_.DL_ICON}" data-cgxui-owner="${SkID}" data-cgxui="${UI_.DL_ICON}">${ICON_.MULTI}</span>
          <span data-cgxui-owner="${SkID}" data-cgxui="${UI_.DL_TEXT}">Download selected as <b>separate</b> files</span>
        </button>
        <div class="${CLS_.DL_MENU_SEP}" data-cgxui-owner="${SkID}" data-cgxui="${UI_.DL_MENU_SEP}"></div>
        <button class="${CLS_.DL_MENU_ITEM}" ${ATTR_.MODE}="clear" data-cgxui-owner="${SkID}" data-cgxui="${UI_.DL_MENU_ITEM}">
          <span class="${CLS_.DL_ICON}" data-cgxui-owner="${SkID}" data-cgxui="${UI_.DL_ICON}">✖</span>
          <span data-cgxui-owner="${SkID}" data-cgxui="${UI_.DL_TEXT}">Clear selection & exit</span>
        </button>
      `;
      document.body.appendChild(menu);
      R.menuEl = menu;

      const fmtBtns = menu.querySelectorAll(SEL_.DL_FORMAT_BTN());
      fmtBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          fmtBtns.forEach(b => b.classList.remove(CLS_.STATE_ACTIVE));
          btn.classList.add(CLS_.STATE_ACTIVE);
          R.currentFormat = btn.dataset.fmt || 'md';
        });
      });
      menu.querySelector(`${SEL_.DL_FORMAT_BTN()}[${ATTR_.FMT}="md"]`)?.classList.add(CLS_.STATE_ACTIVE);

      menu.addEventListener('click', (e) => {
        const item = e.target.closest(`.${CLS_.DL_MENU_ITEM}`);
        if (!item) return;

        const mode = item.dataset.mode;
        const ids = DATA_exportIdsFromSelection();

        if ((mode === 'one' || mode === 'multi') && ids.length === 0) {
          alert('Select at least one answer in the MiniMap first.');
          UI_hideMenu();
          return;
        }

        if (mode === 'one') {
          EXPORT_bundle(ids);
          ACT_clearSelectionsAndExit();
        } else if (mode === 'multi') {
          ids.forEach(id => EXPORT_one(id));
          ACT_clearSelectionsAndExit();
        } else if (mode === 'clear') {
          ACT_clearSelectionsAndExit();
        }
        UI_hideMenu();
      });

      UTIL_on(document, 'click', (e) => {
        if (!R.menuEl?.classList.contains(CLS_.STATE_OPEN)) return;
        const btn = document.getElementById(ID_.TOPBTN) || document.querySelector(SEL_.DL_TOGGLE());
        if (R.menuEl.contains(e.target) || btn?.contains(e.target)) return;
        UI_hideMenu();
      });

      UTIL_on(window, 'keydown', (e) => { if (e.key === 'Escape') UI_hideMenu(); });
    }

    const r = anchorBtn.getBoundingClientRect();
    // Open first so we can measure width, then center under the button.
    R.menuEl.style.top = `${Math.round(r.bottom + 8 + window.scrollY)}px`;
    R.menuEl.style.left = `${Math.round(r.left + window.scrollX)}px`; // temp
    R.menuEl.style.right = 'auto';
    R.menuEl.classList.add(CLS_.STATE_OPEN);

    requestAnimationFrame(() => {
      const menu = R.menuEl;
      if (!menu) return;
      const mw = menu.getBoundingClientRect().width || menu.offsetWidth || 260;
      let left = (window.scrollX + r.left + (r.width / 2) - (mw / 2));
      // clamp to viewport
      const pad = 10;
      const minL = window.scrollX + pad;
      const maxL = window.scrollX + window.innerWidth - mw - pad;
      if (left < minL) left = minL;
      if (left > maxL) left = maxL;
      menu.style.left = `${Math.round(left)}px`;
    });
  }

  /** @helper */
  function UI_hideMenu() { R.menuEl?.classList.remove(CLS_.STATE_OPEN); }

  /* ───────────────────────────── 13) Actions ───────────────────────────── */
  /** @critical */
  function ACT_applySelectAll(flag) {
    R.selectedIds.clear();

    if (flag) {
      const panel = SEL_.MINIMAP();
      const btns = panel
        ? Array.from(panel.querySelectorAll(SEL_.MINIMAP_BTN_SEL()))
        : SEL_.MINIMAP_BTN();

      for (const btn of btns) {
        const id = String(btn?.dataset?.id || '').trim();
        if (id) R.selectedIds.add(id);
      }

      // Fallback if MiniMap buttons are not available yet.
      if (!R.selectedIds.size) {
        for (const el of DATA_answers()) {
          const id = UTIL_getMessageId(el);
          if (id) R.selectedIds.add(id);
        }
      }
    }

    R.allSelected = !!flag;
    if (R.selectAllBtn) R.selectAllBtn.classList.toggle(CLS_.STATE_ACTIVE, !!flag);

    // Update marks instantly
    UI_positionAllMarks();
  }

  /** @critical */
  function ACT_clearSelectionsAndExit() {
    R.selectedIds.clear();
    R.allSelected = false;

    const btn = document.getElementById(ID_.TOPBTN) || document.querySelector(SEL_.DL_TOGGLE());
    btn?.classList.remove(CLS_.STATE_ACTIVE);

    if (R.selectAllBtn) R.selectAllBtn.classList.remove(CLS_.STATE_ACTIVE);

    R.isDownloadMode = false;
    if (R.dlLayer) R.dlLayer.classList.remove(CLS_.STATE_ACTIVE);
    UI_positionAllMarks();     // hides marks
    UI_positionSelectAllBtn(); // hides select-all dot
  }

  /* ───────────────────────────── 14) Topbar button ───────────────────────────── */
  /** @core */

  function UI_attachTopbarBtnOnce() {
    if (document.getElementById(ID_.TOPBTN)) {
      R.topBtn = document.getElementById(ID_.TOPBTN);
      return;
    }

    const btn = document.createElement('button');
    btn.id = ID_.TOPBTN;
    btn.className = CLS_.DL_TOGGLE;
    btn.setAttribute(ATTR_.CGXUI_OWNER, SkID);
    btn.setAttribute(ATTR_.CGXUI, UI_.DL_TOGGLE);
    btn.innerHTML = `<span data-cgxui-owner="${SkID}" data-cgxui="${UI_.DL_TEXT}">Export</span>`;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const panel = SEL_.MINIMAP();
      const menuOpen = R.menuEl?.classList?.contains?.(CLS_.STATE_OPEN);

      // Turn ON
      if (!R.isDownloadMode) {
        R.isDownloadMode = true;
        btn.classList.add(CLS_.STATE_ACTIVE);

        UI_ensureDlLayer();
        if (R.dlLayer) R.dlLayer.classList.add(CLS_.STATE_ACTIVE);
        UI_ensureSelectAllBtn();
        UI_positionSelectAllBtn();

        UI_ensureMenu(btn);
      } else if (!menuOpen) {
        UI_ensureMenu(btn);
      }

      const menu = R.menuEl?.classList?.contains?.(CLS_.STATE_OPEN);
      if (menu && !R.isDownloadMode) {
        UI_hideMenu();
      }
    });

    const container = DOM_ensureTopbarDock();
    if (container) {
      container.appendChild(btn);
      R.topBtn = btn;
      UI_positionExportButton();
    }
  }

  /* ───────────────────────────── 15) Boot + wiring ───────────────────────────── */
  /** @core */
  function CORE_wireRepositionListeners() {
    UTIL_on(window, 'scroll', UI_scheduleReposition, { passive: true });
    UTIL_on(window, 'resize', UI_scheduleReposition);

    // MinimMap internal scrolling can move boxes without window scroll
    const onInnerScroll = (e) => {
      const mm = SEL_.MINIMAP();
      if (!mm) return;
      if (mm.contains(e.target)) UI_scheduleReposition();
    };
    UTIL_on(document, 'scroll', onInnerScroll, true);

  }

  /** @core */
  function CORE_EC_boot() {
    if (W[CLEAN_.INIT_GUARD]) return;
    W[CLEAN_.INIT_GUARD] = true;

    W.attachDownloadCheck = API_attachDownloadCheck;
    W.h2oAttachDownloadCheck = API_attachDownloadCheck;
    CLEAN_add(() => {
      try { delete W.attachDownloadCheck; } catch {}
      try { delete W.h2oAttachDownloadCheck; } catch {}
    });

    CORE_injectCssOnce();
    UI_attachTopbarBtnOnce();
    CORE_wireRepositionListeners();
    UI_startExportWatcher();

    // Canonical events
    const onMmReady = () => {
      if (R.isDownloadMode) UI_scheduleReposition();
      UI_attachTopbarBtnOnce();
    };
    UTIL_on(window, EV_.MM_READY, onMmReady);

    // Light navigation hooks
    UTIL_on(window, EV_.NAVIGATE, () => UI_attachTopbarBtnOnce());
    UTIL_on(window, 'popstate', () => UI_attachTopbarBtnOnce());

    // Legacy bridge (listen old → re-dispatch canonical)
    const onLegacyMmReady = (e) => { UTIL_emit(EV_.MM_READY, e?.detail); };
    const onLegacyNavigate = (e) => { UTIL_emit(EV_.NAVIGATE, e?.detail); };
    UTIL_on(window, MIG_.LEG_MM_READY, onLegacyMmReady);
    UTIL_on(window, MIG_.LEG_NAVIGATE, onLegacyNavigate);

    // Poll in case header loads later
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      UI_attachTopbarBtnOnce();
      if (document.getElementById(ID_.TOPBTN) || tries > 40) clearInterval(t);
    }, 300);
    CLEAN_add(() => { try { clearInterval(t); } catch {} });
  }

  /** @core */
  function CORE_EC_dispose() {
    if (!W[CLEAN_.INIT_GUARD]) return;
    try { delete W[CLEAN_.INIT_GUARD]; } catch { W[CLEAN_.INIT_GUARD] = false; }

    const cleanups = R.cleanups.splice(0);
    for (const fn of cleanups) { try { fn(); } catch {} }

    if (R.rafPos) {
      try { cancelAnimationFrame(R.rafPos); } catch {}
      R.rafPos = 0;
    }

    R.selectedIds.clear();
    R.dlMarkById.clear();
    R.wrapById.clear();
    R.idByEl = new WeakMap();
    R.nextEphemeral = 1;
    R.isDownloadMode = false;
    R.allSelected = false;

    if (R.menuEl?.parentNode) R.menuEl.remove();
    if (R.selectAllBtn?.parentNode) R.selectAllBtn.remove();
    if (R.topBtn?.parentNode) R.topBtn.remove();
    const wrap = document.getElementById(ID_.TOPBTN_WRAP);
    if (wrap?.parentNode) wrap.remove();
    if (R.dlLayer?.parentNode) R.dlLayer.remove();
    const styleEl = document.getElementById(CSS_.STYLE_ID);
    if (styleEl?.parentNode) styleEl.remove();
    R.menuEl = null;
    R.selectAllBtn = null;
    R.topBtn = null;
    R.dlLayer = null;
  }

  CORE_EC_boot();
})();
