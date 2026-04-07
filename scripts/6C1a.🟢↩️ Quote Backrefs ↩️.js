// ==UserScript==
// @h2o-id             6c1a.quote.backrefs
// @name               6C1a.🟢↩️ Quote Backrefs ↩️
// @namespace          H2O.Premium.CGX.quote.backrefs
// @author             HumamDev
// @version            0.2.8
// @revision           001
// @build              260323-000001
// @description        Adds a gutter marker (arrow + turn number) on a dedicated "Quote lane" in Margin Anchor at the exact line of quoted text (integrates with Quote Tracker + QWrapper).
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* ============================================================================
   * H2O Module Standard — Contract (v2.0) — Stage 1 (Mechanics only)
   * ========================================================================== */

  /* ───────────────────────────── 0) IDENTITY ───────────────────────────── */

  // NOTE: If you want different identity, only change these 4:
  const TOK  = 'MQ';          // module token (2 letters)
  const PID  = 'mqbkref';     // consonant-only canonical id
  const CID  = 'MQBKREF';     // identifier token
  const SkID = 'mqbr';        // cgxui owner / UI skin id

  const SUITE = 'prm';
  const HOST  = 'cgx';

  const BrID = PID;
  const DsID = PID;

  const W = window;
  const D = document;

  /* ───────────────────────────── 1) REGISTRIES ───────────────────────────── */

  const ATTR_ = Object.freeze({
    CGXUI:       'data-cgxui',
    CGXUI_OWNER: 'data-cgxui-owner',
    CGXUI_STATE: 'data-cgxui-state',
  });

  // Quote Tracker selectors (source)
  const SEL_QT_ = Object.freeze({
    QBOX:   '.cgxui-qswr-quoteBox',
    QTITLE: '.cgxui-qswr-quoteTitle',

    // mirror Quote Tracker's quote text resolution priority
    QBTN_P:    'button p, [role="button"] p',
    QBTN_ANY:  'button, [role="button"]',
  });

  // ChatGPT message selectors (fallback)
  const SEL_CHAT_ = Object.freeze({
    USER_MSG:   '[data-message-author-role="user"]',
    ASSIST_MSG: '[data-message-author-role="assistant"]',
    MARKDOWN_SCOPE: '.markdown, .prose, [class*="markdown"], [class*="prose"]',
    ANY_MSG:   '[data-message-author-role="user"], [data-message-author-role="assistant"]',
  });

  // Margin Anchor identity (known from 3A file)
  const MA_ = Object.freeze({
    TOK: 'MA',
    PID: 'mrgnnchr',
    SkID: 'mrnc',
    SUITE: 'prm',
    HOST: 'cgx',

    // READY topic (matches 3A Margin Anchor v1.4.7)
    EV_READY_V1: 'h2o.ev:prm:cgx:mrgnnchr:ready:v1',

    // MA marks layer is injected inside each assistant msg: [data-cgxui="mrnc-marks"][data-cgxui-owner="mrnc"]
    SEL_MARKS_LAYER: `[${ATTR_.CGXUI}="mrnc-marks"][${ATTR_.CGXUI_OWNER}="mrnc"]`,
  });

  // Quote Tracker events (string topics)
  const EV_QT_ = Object.freeze({
    WRAPPED:       'h2o:qwrap:wrapped',
    QUOTE_PENDING: 'h2o:quote:pending',
    CHIP_CHANGED:  'h2o:quote:chip',
  });

  // Script UI tokens (our overlay)
  const UI_ = Object.freeze({
    LAYER: `${SkID}-layer`,   // injected as sibling overlay (NOT inside MA marks; MA clears marks)
    MARK:  `${SkID}-mark`,    // per-quote marker (arrow + badge)
    ARROW: `${SkID}-arrow`,   // arrow glyph
    BADGE: `${SkID}-badge`,   // number pill
  });

  const CSS_ = Object.freeze({
    STYLE_ID:     `cgxui-${SkID}-style`,
    VAR_LANE_X:   `--cgxui-${SkID}-lane-x`, // kept for compatibility with existing style id/vars
    VAR_ALPHA:    `--cgxui-${SkID}-alpha`,
    VAR_W:        `--cgxui-${SkID}-w`,      // computed gutter width (px)
    VAR_TR:       `--cgxui-${SkID}-tr`,     // computed MA transform
    VAR_Z:        `--cgxui-${SkID}-z`,      // computed MA z-index
  });

  const CFG_ = Object.freeze({
    AUTO_START: true,
    IDLE_DELAY_MS: 80,
    RESCAN_THROTTLE_MS: 90,

    // marker layout / lane placement (external gutter lane)
    // defined natively from gutter RIGHT edge: 60% from right
    LANE_RIGHT_PCT: '60%',
    ARROW_CHAR: '⤷', // alternatives: '⤷', '↪', '⤥'

    // positioning
    Y_NUDGE_PX: -8,
    MARK_H_PX: 28,

    LANE_OUT_GAP_PX: 34,

    STACK_DY_PX: 44,
    SNAP_Y_PX: 4,
    MAX_MARKS_PER_MSG: 80,

    // matching tolerance
    MIN_QUOTE_LEN: 4,
    PREFIX_FALLBACK_LEN: 18,

    // reliability gates (mirror Quote Tracker confidence)
    REQUIRE_CONFIDENT: true,
    REQUIRE_UNAMBIGUOUS: true,
    RENDER_UNCERTAIN: false,
  });

  /* ───────────────────────────── 2) VAULT + BOUNDED DIAG ───────────────────────────── */

  W.H2O = W.H2O || {};
  W.H2O[TOK] = W.H2O[TOK] || {};
  W.H2O[TOK][BrID] = W.H2O[TOK][BrID] || {};

  const MOD = W.H2O[TOK][BrID];
  MOD.diag  = MOD.diag  || {};
  MOD.state = MOD.state || {};
  MOD.api   = MOD.api   || {};

  const STATE = MOD.state;

  /* ───────────────────────────── 3) CSS ───────────────────────────── */


  /* ───────────────────────────── 3) CSS ───────────────────────────── */

  function CSS_text() {
    const selScoped = (ui) => `[${ATTR_.CGXUI}="${ui}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`;

    return `
      ${selScoped(UI_.LAYER)}{
        position: absolute;
        top: 0;
        left: 0;

        /* Computed from MA core at runtime */
        width: var(${CSS_.VAR_W}, 56px);
        height: 100%;
        transform: var(${CSS_.VAR_TR}, none);
        z-index: var(${CSS_.VAR_Z}, 0);

        pointer-events: auto;
        overflow: visible;

        ${CSS_.VAR_ALPHA}: 0.94;
      }

      /* Quote Backref marker — sibling overlay aligned to MA external gutter lane */
      ${selScoped(UI_.MARK)}{
        position: absolute;
        left: auto;
        right: ${CFG_.LANE_RIGHT_PCT};
        transform: translateX(50%);

        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;

        min-height: ${CFG_.MARK_H_PX}px;
        padding: 0 11px;

        border-radius: 999px;
        background: rgba(255,255,255,0.055);
        border: 1px solid rgba(255,255,255,0.13);

        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);

        box-shadow:
          0 10px 22px rgba(0,0,0,0.24),
          inset 0 0 0 1px rgba(255,255,255,0.045);

        color: rgba(255,255,255,0.93);
        font: 13px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        letter-spacing: 0.15px;

        opacity: var(${CSS_.VAR_ALPHA});
        text-shadow: 0 1px 2px rgba(0,0,0,0.35);

        white-space: nowrap;
        user-select: none;
      }

      ${selScoped(UI_.MARK)}[${ATTR_.CGXUI_STATE}="uncertain"]{
        opacity: 0.55;
        filter: saturate(0.85);
      }

      ${selScoped(UI_.ARROW)}{
        appearance: none;
        -webkit-appearance: none;

        display: inline-flex;
        align-items: center;
        justify-content: center;

        border: none;
        background: transparent;
        padding: 0;
        margin: 0;

        font-size: 20px;
        line-height: 1;
        opacity: 0.92;
        transform: translateY(-0.5px);

        cursor: pointer;
        pointer-events: auto;
        color: rgba(255,255,255,0.92);
        text-shadow: 0 1px 2px rgba(0,0,0,0.35);
      }

      ${selScoped(UI_.ARROW)}:hover{
        opacity: 1;
        filter: drop-shadow(0 6px 10px rgba(0,0,0,0.35));
      }

${selScoped(UI_.BADGE)}{
  display: inline;
  min-width: 0;
  height: auto;
  padding: 0;

background: transparent;
border: none;
border-radius: 0;
padding: 0 0 1px 0;
box-shadow: inset 0 -1px 0 rgba(255,255,255,0.18);
font-weight: 500;


  font-size: 12.5px;
  font-weight: 300;
  color: rgba(255,255,255,0.92);
  letter-spacing: 0.2px;
}

    `;
  }


  function UI_ensureStyle() {
    let el = D.getElementById(CSS_.STYLE_ID);
    if (!el) {
      el = D.createElement('style');
      el.id = CSS_.STYLE_ID;
      D.documentElement.appendChild(el);
      STATE.disposers = STATE.disposers || [];
      STATE.disposers.push(() => { try { el.remove(); } catch {} });
    }
    const txt = CSS_text();
    if (el.textContent !== txt) el.textContent = txt;
  }

  /* ───────────────────────────── 4) BUS HELPERS (H2O.events or DOM events) ───────────────────────────── */

  function BUS_on(topic, handler) {
    const onBus = !!W.H2O?.events?.on;
    if (onBus) {
      try { W.H2O.events.on(topic, handler); return () => { try { W.H2O.events.off?.(topic, handler); } catch {} }; } catch {}
    }
    const wrap = (e) => handler(e?.detail || e);
    W.addEventListener(topic, wrap);
    return () => W.removeEventListener(topic, wrap);
  }

  /* ───────────────────────────── 5) QUOTE TEXT CANON (mirror QT logic) ───────────────────────────── */

  function UTIL_stripMdMarkers(s) {
    s = String(s || '');
    s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
    s = s.replace(/__([^_]+)__/g, '$1');
    s = s.replace(/\*([^*\n]+)\*/g, '$1');
    s = s.replace(/_([^_\n]+)_/g, '$1');
    s = s.replace(/```/g, '');
    s = s.replace(/`/g, '');
    s = s.replace(/^\s*[=]{6,}\s*$/gm, '');
    s = s.replace(/^\s*[-]{6,}\s*$/gm, '');
    s = s.replace(/^\s*[↪↩↳⤷⤥]\s*/gm, '');
    return s;
  }

  function UTIL_norm(s) {
    s = UTIL_stripMdMarkers(s);
    return String(s || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/^"+|"+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function UTIL_canonQuoteText(s) {
    return UTIL_norm(s)
      .replace(/^[\s>“"']+/g, '')
      .replace(/[\s”"'.!?:;]+$/g, '')
      .trim();
  }

  /* ───────────────────────────── 6) MA ACCESS ───────────────────────────── */

  function MA_getCore() {
    return W.H2O?.[MA_.TOK]?.[MA_.PID]?.api?.core || null;
  }

  function MA_findMarksLayer(msgEl) {
    return msgEl?.querySelector?.(MA_.SEL_MARKS_LAYER) || null;
  }

  function MA_ensureOverlayLayer(msgEl) {
    const marks = MA_findMarksLayer(msgEl);
    if (!marks || !msgEl) return null;

    // ⚠️ IMPORTANT:
    // Margin Anchor clears marks.textContent on every repaint (DOM_MA_renderPins),
    // so NEVER mount inside marks. Mount as a sibling overlay and copy marks geometry.
    let layer = msgEl.querySelector(`[${ATTR_.CGXUI}="${UI_.LAYER}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`);
    if (!layer) {
      layer = D.createElement('div');
      layer.setAttribute(ATTR_.CGXUI, UI_.LAYER);
      layer.setAttribute(ATTR_.CGXUI_OWNER, SkID);

      // Put it after MA's own layers (gut + marks are inserted as firstChild)
      msgEl.appendChild(layer);
    }

    // Sync MA geometry (width/transform/z-index) onto our layer as CSS vars
    try {
      const r = marks.getBoundingClientRect();
      const cs = W.getComputedStyle(marks);

      layer.style.setProperty(CSS_.VAR_W, `${Math.max(0, Math.round(r.width))}px`);
      layer.style.setProperty(CSS_.VAR_TR, cs.transform || 'none');

      // keep just above pins but below menus; safest = same as marks
      const z = parseInt(cs.zIndex || '0', 10);
      layer.style.setProperty(CSS_.VAR_Z, Number.isFinite(z) ? String(z) : '0');
    } catch {}

    return layer;
  }

  /* ───────────────────────────── 7) TURN HELPERS ───────────────────────────── */

  function UTIL_turnIdxFromAEl(aEl) {
    if (!aEl) return 0;

    // Prefer Core turn API if present
    const turnAPI = W.H2O?.turn;
    if (turnAPI?.getTurnIndexByAEl) {
      const k = Number(turnAPI.getTurnIndexByAEl(aEl) || 0);
      if (Number.isFinite(k) && k > 0) return k;
    }

    // Fallback: DOM order among assistant messages (1-based)
    const as = [...D.querySelectorAll(SEL_CHAT_.ASSIST_MSG)];
    const i = as.indexOf(aEl);
    return i >= 0 ? (i + 1) : 0;
  }

  function UTIL_getAssistMsgByTurnIndex(tidx) {
    tidx = Number(tidx || 0);
    if (!tidx || tidx < 1) return null;

    const as = [...D.querySelectorAll(SEL_CHAT_.ASSIST_MSG)];

    // Prefer Core turn index match if available
    const turnAPI = W.H2O?.turn;
    if (turnAPI?.getTurnIndexByAEl) {
      for (const a of as) {
        const k = Number(turnAPI.getTurnIndexByAEl(a) || 0);
        if (k === tidx) return a;
      }
    }

    return as[tidx - 1] || null;
  }
  function UTIL_getUserMsgByTurnIndex(tidx) {
    const a = UTIL_getAssistMsgByTurnIndex(tidx);
    if (!a) return null;

    const list = [...D.querySelectorAll(SEL_CHAT_.ANY_MSG)];
    let i = list.indexOf(a);
    if (i < 0) return null;

    for (let k = i - 1; k >= 0; k--) {
      const el = list[k];
      if (el?.matches?.(SEL_CHAT_.USER_MSG)) return el;
    }
    return null;
  }



  function UTIL_nextAssistantAfterUser(userMsgEl) {
    if (!userMsgEl) return null;

    // Use DOM-order scan over all message nodes
    const list = [...D.querySelectorAll(SEL_CHAT_.ANY_MSG)];
    const i = list.indexOf(userMsgEl);
    if (i < 0) return null;

    for (let k = i + 1; k < list.length; k++) {
      const el = list[k];
      if (el?.matches?.(SEL_CHAT_.ASSIST_MSG)) return el;
    }
    return null;
  }

  function UTIL_destTurnIndexForQuoteBox(qb) {
    // Destination = the turn that *contains* this quote chip (user question → its next assistant answer)
    const userMsg = qb?.closest?.(SEL_CHAT_.USER_MSG) || null;
    const nextA = UTIL_nextAssistantAfterUser(userMsg);
    const tidx = UTIL_turnIdxFromAEl(nextA);
    return tidx || 0;
  }

  /* ───────────────────────────── 8) TEXT RANGE MATCHER -> RECT ───────────────────────────── */

  const CACHE_normIndex = new WeakMap();

  function UTIL_buildNormIndex(root) {
    if (!root) return null;

    const prev = CACHE_normIndex.get(root);
    const sig = `${root.textContent?.length || 0}:${root.childElementCount || 0}`;
    if (prev && prev.sig === sig) return prev;

    const walker = D.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const map = []; // each entry -> { n: TextNode, o: offsetInNode }
    let out = '';

    const pushChar = (ch, node, off) => {
      out += ch;
      map.push({ n: node, o: off });
    };

    while (walker.nextNode()) {
      const n = walker.currentNode;
      const s = String(n.nodeValue || '');

      let i = 0;
      while (i < s.length) {
        let ch = s[i];

        // normalize quotes + nbsp
        if (ch === '\u00a0') ch = ' ';
        if (ch === '“' || ch === '”') ch = '"';
        if (ch === '‘' || ch === '’') ch = "'";

        // collapse whitespace runs to single space
        if (/\s/.test(ch)) {
          const start = i;
          while (i < s.length && /\s/.test(s[i])) i++;
          pushChar(' ', n, start);
          continue;
        }

        pushChar(ch, n, i);
        i++;
      }

      // add a separator space between text nodes
      pushChar(' ', n, (s.length ? s.length - 1 : 0));
    }

    const built = { sig, s: out, map };
    CACHE_normIndex.set(root, built);
    return built;
  }

  function LOCATE_quoteRectInMsg(msgEl, qCanon) {
    try {
      if (!msgEl || !qCanon) return null;

      const root =
        msgEl.querySelector(SEL_CHAT_.MARKDOWN_SCOPE) ||
        msgEl;

      const idx = UTIL_buildNormIndex(root);
      if (!idx || !idx.s || !idx.map?.length) return null;

      const needleFull = UTIL_canonQuoteText(qCanon);
      if (!needleFull || needleFull.length < CFG_.MIN_QUOTE_LEN) return null;

      const tryFind = (needle) => {
        if (!needle) return -1;
        return idx.s.indexOf(needle);
      };

      // 1) exact match
      let pos = tryFind(needleFull);

      // 2) prefix match (helps when Quote Tracker truncated)
      if (pos < 0) {
        const n = needleFull.slice(0, CFG_.PREFIX_FALLBACK_LEN).trim();
        if (n.length >= CFG_.MIN_QUOTE_LEN) pos = tryFind(n);
      }

      // 3) word-anchor match (first 2–3 meaningful words)
      if (pos < 0) {
        const words = needleFull.split(/\s+/g).filter(w => w && w.length >= 3);
        const anchor = words.slice(0, 3).join(' ').trim();
        if (anchor.length >= CFG_.MIN_QUOTE_LEN) pos = tryFind(anchor);
      }

      if (pos < 0) return null;

      // Range length: use full needle when possible, else a safe window
      const useLen = Math.min(needleFull.length, 48);
      const a = idx.map[pos];
      const b = idx.map[Math.min(idx.map.length - 1, pos + useLen - 1)];
      if (!a?.n || !b?.n) return null;

      const r = D.createRange();
      r.setStart(a.n, Math.max(0, a.o));
      r.setEnd(b.n, Math.min((b.n.nodeValue || '').length, b.o + 1));

      const rect = r.getBoundingClientRect();
      if (!rect || !isFinite(rect.top)) return null;
      return rect;
    } catch {
      return null;
    }
  }

  /* ───────────────────────────── 9) QUOTE SCAN -> MODEL ───────────────────────────── */

  function QT_readQuoteText(qb) {
    return (
      qb?.querySelector?.(SEL_QT_.QBTN_P)?.innerText ||
      qb?.querySelector?.(SEL_QT_.QBTN_ANY)?.innerText ||
      qb?.querySelector?.(SEL_QT_.QBTN_ANY)?.textContent ||
      ''
    );
  }

  function UTIL_parseFromAnswerIndex(qb) {
    if (!qb) return 0;

    // Primary: dataset (string number or '?')
    const raw = qb.dataset?.hoQuoteFrom || qb.dataset?.h2oQuoteFrom || '';
    const n = parseInt(String(raw || '').trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;

    // Fallback: parse from title "QUOTE (ANSWER 12)"
    const title = qb.querySelector?.(SEL_QT_.QTITLE) || null;
    const t = String(title?.innerText || title?.textContent || '');
    const m = t.match(/\bANSWER\s+(\d+)\b/i);
    if (m) {
      const k = parseInt(m[1], 10);
      if (Number.isFinite(k) && k > 0) return k;
    }
    return 0;
  }

  function QT_collectQuotes() {
    const qbs = [...D.querySelectorAll(SEL_QT_.QBOX)];
    const out = [];

    for (const qb of qbs) {
      const conf = String(qb?.dataset?.hoQuoteConf || qb?.dataset?.h2oQuoteConf || '');
      const amb  = String(qb?.dataset?.hoQuoteAmb  || qb?.dataset?.h2oQuoteAmb  || '');
      const isConfident = (conf === '1');
      const isAmbiguous = (amb === '1');
      const allow = (!CFG_.REQUIRE_CONFIDENT || isConfident) && (!CFG_.REQUIRE_UNAMBIGUOUS || !isAmbiguous);
      const uncertain = !allow;
      if (uncertain && !CFG_.RENDER_UNCERTAIN) continue;

      const fromAIdx = UTIL_parseFromAnswerIndex(qb);
      if (!Number.isFinite(fromAIdx) || fromAIdx < 1) continue;

      const toTurnIdx = UTIL_destTurnIndexForQuoteBox(qb);
      if (!Number.isFinite(toTurnIdx) || toTurnIdx < 1) continue;

      // Mirror Quote Tracker's matching: read chip text, then canon + strip trailing ellipsis/dots.
      let rawText = QT_readQuoteText(qb);
      rawText = String(rawText || '').replace(/[.…]+\s*$/g, '');

      let qCanon = UTIL_canonQuoteText(rawText);
      qCanon = String(qCanon || '').replace(/[.…]+\s*$/g, '').trim();

      if (!qCanon || qCanon.length < CFG_.MIN_QUOTE_LEN) continue;

      out.push({ fromAIdx, toTurnIdx, qCanon, uncertain });
    }

    return out;
  }

  /* ───────────────────────────── 10) RENDER ───────────────────────────── */

  function UTIL_snapY(y) {
    const s = CFG_.SNAP_Y_PX;
    return Math.round(y / s) * s;
  }

  function UI_clearAllOverlays() {
    const asAll = [...D.querySelectorAll(SEL_CHAT_.ASSIST_MSG)];
    for (const a of asAll) {
      const layer = a?.querySelector?.(`[${ATTR_.CGXUI}="${UI_.LAYER}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`);
      if (layer) layer.textContent = '';
    }
  }

  function UI_renderAll() {
    const quotes = QT_collectQuotes();

    // Always clear to avoid stale markers.
    UI_clearAllOverlays();
    if (!quotes.length) return;

    // group by origin answer/turn index (where the quoted text lives)
    const byFrom = new Map();
    for (const q of quotes) {
      const arr = byFrom.get(q.fromAIdx) || [];
      arr.push(q);
      byFrom.set(q.fromAIdx, arr);
    }

    for (const [fromAIdx, arr] of byFrom.entries()) {
      const msgEl = UTIL_getAssistMsgByTurnIndex(fromAIdx);
      if (!msgEl) continue;

      const layer = MA_ensureOverlayLayer(msgEl);
      if (!layer) continue;
      layer.textContent = '';

      const msgRect = msgEl.getBoundingClientRect();

      const marks = [];
      const seen = new Set();
      for (const q of arr.slice(0, CFG_.MAX_MARKS_PER_MSG)) {
        const rect = LOCATE_quoteRectInMsg(msgEl, q.qCanon);

        // If we cannot locate, still render at top so user sees *something* (helps in edge cases).
        let y = rect ? ((rect.top - msgRect.top) + CFG_.Y_NUDGE_PX) : 0;

        y = Math.max(0, UTIL_snapY(y));
        const k = String(q.toTurnIdx) + ":" + String(y);
        if (seen.has(k)) continue;
        seen.add(k);
        marks.push({ y, toTurnIdx: q.toTurnIdx });
      }

      // de-conflict stacking
      marks.sort((a, b) => a.y - b.y);
      const minDY = Math.max(CFG_.STACK_DY_PX, CFG_.MARK_H_PX + 10);
      for (let i = 1; i < marks.length; i++) {
        const prev = marks[i - 1];
        const cur = marks[i];
        if (Math.abs(cur.y - prev.y) < minDY) cur.y = prev.y + minDY;
      }

      for (const m of marks) {
        const el = D.createElement('div');
        el.setAttribute(ATTR_.CGXUI, UI_.MARK);
        el.setAttribute(ATTR_.CGXUI_OWNER, SkID);
        if (m.uncertain) el.setAttribute(ATTR_.CGXUI_STATE, "uncertain");
        el.style.top = `${m.y}px`;

        const arrow = D.createElement('button');
        arrow.type = 'button';
        arrow.setAttribute(ATTR_.CGXUI, UI_.ARROW);
        arrow.setAttribute(ATTR_.CGXUI_OWNER, SkID);
        arrow.textContent = CFG_.ARROW_CHAR;
        arrow.dataset.turn = String(m.toTurnIdx);
        arrow.title = `Go to Question ${m.toTurnIdx}`;

        const badge = D.createElement('span');
        badge.setAttribute(ATTR_.CGXUI, UI_.BADGE);
        badge.setAttribute(ATTR_.CGXUI_OWNER, SkID);
        badge.textContent = `Q${m.toTurnIdx}`;

        el.appendChild(arrow);
        el.appendChild(badge);
        layer.appendChild(el);
      }
    }

    // Let MA repaint if it wants (safe)
    try { MA_getCore()?.ui?.scheduleRefreshAll?.(); } catch {}
  }

  /* ───────────────────────────── 11) SCHEDULING ───────────────────────────── */

  let tScan = 0;

  function scheduleRender(reason) {
    if (tScan) return;
    tScan = setTimeout(() => {
      tScan = 0;
      try { UI_renderAll(); } catch {}
    }, CFG_.RESCAN_THROTTLE_MS);
  }

  function scheduleRenderIdle(reason) {
    if (W.requestIdleCallback) {
      W.requestIdleCallback(() => scheduleRender(reason), { timeout: CFG_.IDLE_DELAY_MS });
    } else {
      setTimeout(() => scheduleRender(reason), CFG_.IDLE_DELAY_MS);
    }
  }

  /* ───────────────────────────── 12) LIFECYCLE ───────────────────────────── */

  function CORE_boot() {
    if (STATE.booted) return;
    STATE.booted = true;

    UI_ensureStyle();
    STATE.disposers = STATE.disposers || [];

    // Click-to-scroll: arrow jumps to the destination question (user message of that turn)
    const onDocClick = (ev) => {
      const t = ev?.target;
      const btn = t?.closest?.(`[${ATTR_.CGXUI}="${UI_.ARROW}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`);
      if (!btn) return;

      const tidx = parseInt(String(btn.dataset?.turn || ''), 10);
      if (!Number.isFinite(tidx) || tidx < 1) return;

      const qEl = UTIL_getUserMsgByTurnIndex(tidx);
      if (!qEl) return;

      ev.preventDefault?.();
      ev.stopPropagation?.();

      try {
        qEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } catch {
        try { qEl.scrollIntoView(true); } catch {}
      }
    };
    D.addEventListener('click', onDocClick, true);
    STATE.disposers.push(() => D.removeEventListener('click', onDocClick, true));


    // MA ready handshake (best-effort)
    const onMAReady = () => scheduleRenderIdle('ma_ready');
    D.addEventListener(MA_.EV_READY_V1, onMAReady);
    STATE.disposers.push(() => D.removeEventListener(MA_.EV_READY_V1, onMAReady));

    // QT signals
    STATE.disposers.push(BUS_on(EV_QT_.WRAPPED,       () => scheduleRenderIdle('qt_wrapped')));
    STATE.disposers.push(BUS_on(EV_QT_.QUOTE_PENDING, () => scheduleRenderIdle('qt_pending')));
    STATE.disposers.push(BUS_on(EV_QT_.CHIP_CHANGED,  () => scheduleRenderIdle('qt_chip')));

    // DOM mutations: quotes / wrappers / messages appear asynchronously in SPA
    const mo = new MutationObserver((muts) => {
      for (const m of muts || []) {
        const nodes = [
          ...(m.addedNodes ? Array.from(m.addedNodes) : []),
          ...(m.removedNodes ? Array.from(m.removedNodes) : []),
        ];
        for (const n of nodes) {
          if (!n || n.nodeType !== 1) continue;
          const el = /** @type {Element} */ (n);

          if (
            el.matches?.(SEL_QT_.QBOX) ||
            el.querySelector?.(SEL_QT_.QBOX) ||
            el.matches?.(SEL_CHAT_.ANY_MSG) ||
            el.querySelector?.(SEL_CHAT_.ANY_MSG)
          ) {
            scheduleRenderIdle('mutation');
            return;
          }
        }
      }
    });
    try { mo.observe(D.documentElement, { childList: true, subtree: true }); } catch {}
    STATE.disposers.push(() => { try { mo.disconnect(); } catch {} });

    // Resize/scroll: rerender (positions change)
    const onResize = () => scheduleRender('resize');
    const onScroll = () => scheduleRender('scroll');
    W.addEventListener('resize', onResize, { passive: true });
    W.addEventListener('scroll', onScroll, { passive: true });
    STATE.disposers.push(() => W.removeEventListener('resize', onResize));
    STATE.disposers.push(() => W.removeEventListener('scroll', onScroll));

    // First pass (in case MA already booted)
    scheduleRenderIdle('boot');

    // Retry a few times to cover "ready" already-fired and SPA hydration timing.
    for (let i = 1; i <= 6; i++) setTimeout(() => scheduleRenderIdle('boot_retry_' + i), 200 * i);
  }

  function CORE_dispose() {
    try {
      for (const fn of (STATE.disposers || []).splice(0)) {
        try { fn?.(); } catch {}
      }
      STATE.booted = false;
    } catch {}
  }

  if (CFG_.AUTO_START) CORE_boot();

})();
