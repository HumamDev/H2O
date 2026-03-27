// ==UserScript==
// @h2o-id             1e1a.answer.title
// @name               1E1a.🔴📛 Answer Title 📛
// @namespace          H2O.Premium.CGX.answer.title
// @author             HumamDev
// @version            2.0.0
// @revision           001
// @build              260304-102754
// @description        Auto-generate titles for ChatGPT answers + inline editable header; sync via shared titles store + events (Contract v2.0 Stage-1).
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* ───────────────────────────── ⬜️ DEFINE — META / BOOTSTRAP 📄🔒💧 ───────────────────────────── */

  const W = window;
  const D = document;

  // ✅ Identity (LOCKED)
  const SUITE = 'prm';
  const HOST  = 'cgx';

  const TOK   = 'AT';           // "Answer Title" → AT
  const PID   = 'tnswrttl';      // canonical anchor (consonant-only)
  const BrID  = PID;            // default
  const DsID  = PID;            // default
  const CID   = 'atitle';       // identifiers only: "Answer Title" → ATITLE
  const SkID  = 'atns';         // preserve existing UI contract to avoid breaking any user CSS overrides

  // Labels only (not identity)
  const MODTAG    = 'ATitle';
  const MODICON   = '📛';
  const EMOJI_HDR = false;

  // Derived (identifiers only)
  const PID_UP = PID.toUpperCase();
  const CID_UP = CID.toUpperCase();

  // Runtime vault
  const H2O = (W.H2O = W.H2O || {});
  const MOD_OBJ = ((H2O[TOK] = H2O[TOK] || {})[BrID] = (H2O[TOK][BrID] || {}));

  MOD_OBJ.meta = MOD_OBJ.meta || {
    tok: TOK, pid: PID, brid: BrID, dsid: DsID, skid: SkID, cid: CID_UP, modtag: MODTAG, suite: SUITE, host: HOST
  };

  // Bounded DIAG
  MOD_OBJ.diag = MOD_OBJ.diag || { t0: performance.now(), steps: [], errors: [], bufMax: 160, errMax: 30 };
  const DIAG = MOD_OBJ.diag;
  const DIAG_push = (arr, max, item) => { try { arr.push(item); if (arr.length > max) arr.splice(0, arr.length - max); } catch {} };
  const DIAG_step = (m, x) => DIAG_push(DIAG.steps, DIAG.bufMax, { t: performance.now(), m, x: x || null });
  const DIAG_err  = (m, e) => DIAG_push(DIAG.errors, DIAG.errMax, { t: performance.now(), m, e: String(e && (e.stack || e.message || e)) });

  // MODE B registries (warn + keep first; no freeze in modules)
  H2O.KEYS = H2O.KEYS || {};
  H2O.EV   = H2O.EV   || {};
  H2O.SEL  = H2O.SEL  || {};
  H2O.UI   = H2O.UI   || {};

  const UTIL_extendRegistry = (regObj, entries, label) => {
    try {
      for (const [k, v] of Object.entries(entries || {})) {
        if (regObj[k] == null) regObj[k] = v;
        else if (regObj[k] !== v) {
          // keep first; warn (no raw console spam: DIAG only)
          DIAG_step('reg:collision', { label, key: k, keep: regObj[k], drop: v });
        }
      }
    } catch (e) { DIAG_err('reg:extend', e); }
  };

  /* ───────────────────────────── ⬛️ DEFINE — CONFIG / CONSTANTS / SCHEMA 📄🔒💧 ───────────────────────────── */

  /* [DEFINE][DOM] Real attribute-name constants (no raw attr names elsewhere) */
  const ATTR_ = Object.freeze({
    MSG_ID: 'data-message-id',
    ROLE: 'data-message-author-role',
    HO_ID: 'data-ho-id',                 // compatibility: some scripts may mirror ids here
    CGXUI: 'data-cgxui',
    CGXUI_OWNER: 'data-cgxui-owner',
    CGXUI_STATE: 'data-cgxui-state',
    CGXUI_PART: 'data-cgxui-part',
    DIR: 'dir',
    TITLE: 'title',
  });

  /* [DEFINE][STORE][API] Namespaces (boundary-only use of DsID) */
  const NS_ = Object.freeze({
    DISK: `h2o:${SUITE}:${HOST}:${DsID}`, // no trailing :
    EV:   `evt:h2o`,
  });

  /* [DEFINE][CFG] knobs */
  const CFG_ = Object.freeze({
    SCAN_DELAY_MS: 800,
    DEBOUNCE_MS: 400,
    RETRY_MAX: 10,
    RETRY_TEXT_MIN: 40,
    REPAIR_EVERY_MS: 5000,
    REPAIR_TEXT_MIN: 80,
    LOCAL_TITLE_MAX: 80,
    // API disabled by default (CSP-safe); left here as contract-friendly knobs
    USE_API: false,
    OPENAI_API_KEY: '',
    OPENAI_MODEL: 'gpt-4o-mini',
    API_MIN_TEXT: 20,
  });

  /* [DEFINE][UI] SkID-based UI token strings */
  const UI_ = Object.freeze({
    BAR:   `${SkID}-answer-title`,
    TEXT:  `${SkID}-answer-title-text`,
    LABEL: `${SkID}-answer-title-label`,
    BADGE: `${SkID}-answer-title-badge`,
  });

  /* [DEFINE][CSS] Style id */
  const CSS_ = Object.freeze({
    STYLE_ID: `cgxui-${SkID}-style`,
  });

  /* [DEFINE][EV] Event topics (canonical + legacy) */
  const EV_ = Object.freeze({
    TITLE_SET:      'evt:h2o:title:set',
    TITLE_SET_LEG:  'ho:title:set',
  });

  /* [DEFINE][STORE] Keys (shared + migrate) */
  // NOTE: Titles map is shared with MiniMap. We treat it as "external contract" and store it in H2O.KEYS when missing.
  const KEY_ = Object.freeze({
    // shared canonical store (MiniMap-owned namespace; do NOT rewrite the string if your MiniMap depends on it)
    MNMP_STATE_TITLES_V1: `h2o:${SUITE}:${HOST}:mnmp:state:titles:v1`,

    // legacy (only for migration)
    LEG_TITLES_OLD_V1: 'ho:answerTitles.v1',

    // our migration marker (our namespace)
    MIG_TITLES_V1: `${NS_.DISK}:migrate:titles:v1`,
  });

  // Extend shared registries (first-wins)
  UTIL_extendRegistry(H2O.KEYS, { MNMP_STATE_TITLES_V1: KEY_.MNMP_STATE_TITLES_V1 }, `[${MODTAG}]`);
  UTIL_extendRegistry(H2O.EV,   { TITLE_SET: EV_.TITLE_SET }, `[${MODTAG}]`);
  // (Selectors/UI not exported; this module is mostly event+storage)

  /* ───────────────────────────── 🟦 SHAPE — CONTRACTS / TYPES 📄🔒💧 ───────────────────────────── */

  // Titles store shape: { [answerId: string]: string }
  // Event detail shape: { answerId: string, title: string }

  /* ───────────────────────────── 🟩 TOOLS — UTILITIES 📄🔓💧 ───────────────────────────── */

  const UTIL_storage = {
    getStr(key, fallback = null) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    setStr(key, val) { try { localStorage.setItem(key, String(val)); return true; } catch { return false; } },
    del(key) { try { localStorage.removeItem(key); return true; } catch { return false; } },
    getJSON(key, fallback = null) {
      const s = this.getStr(key, null);
      if (s == null) return fallback;
      try { return JSON.parse(s); } catch { return fallback; }
    },
    setJSON(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch { return false; } },
  };

  const UTIL_isArabicText = (text) => {
    if (!text) return false;
    const arabic = text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) || [];
    const latin  = text.match(/[A-Za-z]/g) || [];
    return arabic.length >= 8 && arabic.length >= latin.length;
  };

  const UTIL_cap = (s) => (s ? (s[0].toUpperCase() + s.slice(1)) : s);

  const UTIL_textTrim = (s) => (s == null ? '' : String(s)).trim();

  const UTIL_getAttr = (el, attr) => {
    try { return el && el.getAttribute ? el.getAttribute(attr) : null; } catch { return null; }
  };

  const UTIL_setAttr = (el, attr, val) => {
    try { if (el) el.setAttribute(attr, val); } catch {}
  };

  const UTIL_delAttr = (el, attr) => {
    try { if (el) el.removeAttribute(attr); } catch {}
  };

  const UTIL_dispatch = (topic, detail) => {
    try { W.dispatchEvent(new CustomEvent(topic, { detail })); } catch (e) { DIAG_err('ev:dispatch', e); }
  };

  /* ───────────────────────────── 🔴 STATE — REGISTRIES / CACHES 📄🔓💧 ───────────────────────────── */

  const STATE_ = MOD_OBJ.state = MOD_OBJ.state || {};

  STATE_.booted = STATE_.booted || false;

  STATE_.seen = STATE_.seen || new Set();                 // answerIds processed
  STATE_.pendingTimers = STATE_.pendingTimers || new Map(); // answerId -> timeoutId
  STATE_.mutatedMsgs = STATE_.mutatedMsgs || new Set();   // msg elements we touched (dir/class) for cleanup

  // Titles overrides are stored in shared key (MiniMap titles map)
  STATE_.titles = STATE_.titles || {}; // loaded map {id:title}

  // Handles for cleanup
  STATE_.clean = STATE_.clean || {
    mo: null,
    repairInt: null,
    listeners: [],
    styleEl: null,
  };

  /* ───────────────────────────── 🟥 ENGINE — DOMAIN LOGIC / PIPELINE 📝🔓💥 ───────────────────────────── */

  const STOPWORDS = new Set([
    'the','and','or','but','so','weil','und','oder','aber','ich','du',
    'you','i','to','of','in','im','am','ist','are','for','mit','von',
    'das','ist','es','ein','eine','der','die','den','dem','zu','auf'
  ]);

  const ENGINE_loadTitles = () => {
    try {
      const raw = UTIL_storage.getStr(KEY_.MNMP_STATE_TITLES_V1, null);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) {
      DIAG_err('store:loadTitles', e);
      return {};
    }
  };

  const ENGINE_saveTitles = (mapObj) => {
    try { UTIL_storage.setJSON(KEY_.MNMP_STATE_TITLES_V1, mapObj || {}); }
    catch (e) { DIAG_err('store:saveTitles', e); }
  };

  const ENGINE_migrateTitlesOnce = () => {
    try {
      if (UTIL_storage.getStr(KEY_.MIG_TITLES_V1, '0') === '1') return;
      const vNew = UTIL_storage.getStr(KEY_.MNMP_STATE_TITLES_V1, null);
      if (vNew == null || vNew === '') {
        const vOld = UTIL_storage.getStr(KEY_.LEG_TITLES_OLD_V1, null);
        if (vOld != null && vOld !== '') UTIL_storage.setStr(KEY_.MNMP_STATE_TITLES_V1, vOld);
      }
      UTIL_storage.del(KEY_.LEG_TITLES_OLD_V1);
      UTIL_storage.setStr(KEY_.MIG_TITLES_V1, '1');
      DIAG_step('migrate:titles', { ok: true });
    } catch (e) { DIAG_err('migrate:titles', e); }
  };

  const ENGINE_applyRtlIfArabic = (msgEl, fullText) => {
    try {
      if (!msgEl) return;
      const rtl = UTIL_isArabicText(fullText);
      // mutate host node (intentional feature): must be reversible in dispose
      if (rtl) {
        msgEl.classList.add(`cgxui-${SkID}-rtl-answer`);
        UTIL_setAttr(msgEl, ATTR_.DIR, 'rtl');
      } else {
        msgEl.classList.remove(`cgxui-${SkID}-rtl-answer`);
        UTIL_delAttr(msgEl, ATTR_.DIR);
      }
      STATE_.mutatedMsgs.add(msgEl);
    } catch (e) { DIAG_err('rtl:apply', e); }
  };

  const ENGINE_isGarbageTitle = (t) => {
    const s = UTIL_textTrim(t);
    if (!s) return true;
    if (/^[\d\W]+$/.test(s)) return true;
    if (s.length < 10) return true;
    return false;
  };

  const ENGINE_extractExplicitHeading = (text) => {
    const lines = String(text || '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .slice(0, 5);

    for (const line of lines) {
      if (line.length < 8) continue;

      let cand = line;

      const dashIdx = cand.indexOf('—');
      const hyIdx   = cand.indexOf(' - ');
      const colIdx  = cand.indexOf(':');
      let cutIdx = -1;
      if (dashIdx !== -1) cutIdx = dashIdx;
      else if (hyIdx !== -1) cutIdx = hyIdx;
      else if (colIdx !== -1) cutIdx = colIdx;

      if (cutIdx !== -1) cand = cand.slice(cutIdx + 1);

      cand = cand
        .replace(/^[^\p{L}\p{N}]+/gu, '')
        .replace(/[^\p{L}\p{N}]+$/gu, '')
        .trim();

      cand = cand.replace(/^["'“”]+|["'“”]+$/g, '').trim();

      if (!cand) continue;
      if (cand.length < 8 || cand.length > 120) continue;

      const words = cand.split(/\s+/);
      if (words.length < 2) continue;
      if (!/[A-ZÄÖÜ]/.test(cand)) continue;

      return cand;
    }
    return null;
  };

  const ENGINE_buildKeywordTitle = (text) => {
    const words = String(text || '')
      .toLowerCase()
      .replace(/[^\p{L}\s]/gu, ' ')
      .split(/\s+/)
      .filter(w => w && !STOPWORDS.has(w));

    if (!words.length) return null;

    const freq = {};
    for (const w of words) freq[w] = (freq[w] || 0) + 1;

    const top = Object.keys(freq)
      .sort((a, b) => freq[b] - freq[a])
      .slice(0, 4);

    if (!top.length) return null;

    if (top.length === 1) return UTIL_cap(top[0]);
    if (top.length === 2) return `${UTIL_cap(top[0])} & ${UTIL_cap(top[1])}`;
    if (top.length === 3) return `${UTIL_cap(top[0])}, ${UTIL_cap(top[1])} & ${UTIL_cap(top[2])}`;
    return `${UTIL_cap(top[0])}, ${UTIL_cap(top[1])} & more`;
  };

  const ENGINE_pickBestSentence = (text) => {
    const rawSentences = String(text || '')
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(Boolean);

    let best = null;
    let bestScore = -1;

    for (const s of rawSentences) {
      const words = s.split(/\s+/);
      const contentWords = words.filter(w => w.replace(/[^\p{L}]/gu, '').length >= 4);
      const score = contentWords.length;

      if (contentWords.length >= 4 && s.length >= 25) return s;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  };

  const ENGINE_generateLocalTitle = (text) => {
    if (!text) return 'Untitled Answer';

    let title = ENGINE_extractExplicitHeading(text);
    if (!ENGINE_isGarbageTitle(title)) return ENGINE_clipTitle(title);

    title = ENGINE_buildKeywordTitle(text);
    if (!ENGINE_isGarbageTitle(title)) return ENGINE_clipTitle(title);

    title = ENGINE_pickBestSentence(text);
    if (!ENGINE_isGarbageTitle(title)) return ENGINE_clipTitle(title);

    return 'Untitled Answer';
  };

  const ENGINE_clipTitle = (t) => {
    let s = UTIL_textTrim(t);
    if (s.length > CFG_.LOCAL_TITLE_MAX) s = s.slice(0, CFG_.LOCAL_TITLE_MAX - 1).trimEnd() + '…';
    return s;
  };

  const ENGINE_generateApiTitle = async (text) => {
    // Kept for feature parity (disabled by default; CSP-safe)
    if (!CFG_.USE_API || !CFG_.OPENAI_API_KEY) return null;
    if (!text || text.length < CFG_.API_MIN_TEXT) return null;

    const TITLE_PROMPT = `
You are a title generator. Given an assistant answer, create ONE short, clear title (max 8 words).
No quotes, no emojis, no numbering. Just the title text.`;

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CFG_.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: CFG_.OPENAI_MODEL,
          messages: [
            { role: 'system', content: TITLE_PROMPT.trim() },
            { role: 'user', content: text }
          ],
          temperature: 0.2,
          max_tokens: 24,
        }),
      });

      if (!res.ok) return null;

      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content || '';
      const title = raw.split('\n')[0].trim();
      return title || null;
    } catch (e) {
      DIAG_err('api:title', e);
      return null;
    }
  };

  /* ───────────────────────────── 🟤 VERIFY/SAFETY — INVARIANTS / HARDENING 📝🔓💧 ───────────────────────────── */

  const SAFE_ = Object.freeze({
    // minimal "fail-soft" wrappers live here
  });

  /* ───────────────────────────── 🟧 BOUNDARIES — DOM / IO ADAPTERS / MOUNT 📝🔓💥 ───────────────────────────── */

  /* [SEL] One selector registry block */
  const SEL_ = Object.freeze({
    ASSISTANT_MSG: `[${ATTR_.ROLE}="assistant"][${ATTR_.MSG_ID}]`,
    TURN: '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]',
    TURNS_ROOT: '[data-testid="conversation-turns"]',
    // owned UI (scoped by owner in builder/helper)
    OWNED_BAR_ANY: `[${ATTR_.CGXUI}="${UI_.BAR}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`,
    OWNED_TEXT_ANY:`[${ATTR_.CGXUI}="${UI_.TEXT}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`,
  });

  const DOM_getAssistantMessages = () => Array.from(D.querySelectorAll(SEL_.ASSISTANT_MSG));

  const DOM_getAnswerId = (msgEl) => UTIL_getAttr(msgEl, ATTR_.MSG_ID) || null;

  const DOM_isPerfProbeLine = (line) => /__oai_(?:logHTML|logTTI|SSR_HTML|SSR_TTI)/.test(String(line || ''));

  const DOM_sanitizeAnswerText = (rawText) => {
    const lines = String(rawText || '')
      .split(/\r?\n/)
      .map(s => UTIL_textTrim(s))
      .filter(Boolean)
      .filter((line) => !DOM_isPerfProbeLine(line));
    return UTIL_textTrim(lines.join('\n'));
  };

  const DOM_collectReadableText = (rootEl) => {
    if (!rootEl) return '';
    let NF = null;
    try { NF = W.NodeFilter || NodeFilter; } catch {}
    if (!NF) return '';

    const chunks = [];
    let walker = null;
    try {
      walker = D.createTreeWalker(rootEl, NF.SHOW_TEXT, {
        acceptNode: (node) => {
          const p = node?.parentElement;
          if (!p) return NF.FILTER_REJECT;
          const tag = String(p.tagName || '').toUpperCase();
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') return NF.FILTER_REJECT;
          try { if (p.closest(SEL_.OWNED_BAR_ANY)) return NF.FILTER_REJECT; } catch {}
          return UTIL_textTrim(node?.nodeValue || '') ? NF.FILTER_ACCEPT : NF.FILTER_REJECT;
        }
      });
    } catch {
      walker = null;
    }
    if (!walker) return '';

    let n = null;
    while ((n = walker.nextNode())) {
      const t = UTIL_textTrim(n.nodeValue || '');
      if (t) chunks.push(t);
    }
    return chunks.join('\n');
  };

  const DOM_getAnswerText = (msgEl) => {
    if (!msgEl) return '';
    try {
      let roots = Array.from(msgEl.querySelectorAll('.markdown'));
      if (!roots.length) roots = Array.from(msgEl.querySelectorAll('.prose'));
      if (!roots.length) roots = [msgEl];

      const chunks = [];
      roots.forEach((rootEl) => {
        const txt = DOM_collectReadableText(rootEl);
        if (txt) chunks.push(txt);
      });

      const clean = DOM_sanitizeAnswerText(chunks.join('\n'));
      if (clean) return clean;
    } catch {}

    try {
      const fallback = msgEl.innerText ? msgEl.innerText.trim() : '';
      return DOM_sanitizeAnswerText(fallback);
    } catch {
      return '';
    }
  };

  const DOM_getTurnNumber = (msgEl) => {
    try {
      const tRaw = Number(W.H2O?.turn?.getTurnIndexByAEl?.(msgEl));
      if (Number.isFinite(tRaw)) {
        if (tRaw === 0) return 1;
        if (tRaw > 0) return Math.floor(tRaw);
      }
    } catch {}

    try {
      const turnEl = msgEl?.closest?.(SEL_.TURN);
      const turnsRoot = D.querySelector(SEL_.TURNS_ROOT) || turnEl?.parentElement;
      if (turnEl && turnsRoot) {
        const turns = Array.from(turnsRoot.querySelectorAll(SEL_.TURN));
        const idx = turns.indexOf(turnEl);
        if (idx >= 0) return idx + 1;
      }
    } catch {}

    try {
      const answers = DOM_getAssistantMessages();
      const idx = answers.indexOf(msgEl);
      if (idx >= 0) return idx + 1;
    } catch {}

    return 0;
  };

  const DOM_selScoped = (uiToken) => `[${ATTR_.CGXUI}="${uiToken}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`;

  const DOM_ensureTitleBar = (msgEl) => {
    const S_BAR = DOM_selScoped(UI_.BAR);
    let existing = null;
    try { existing = msgEl.querySelector(`:scope > ${S_BAR}`); } catch {}
    if (existing) return existing;

    const bar = D.createElement('div');
    UTIL_setAttr(bar, ATTR_.CGXUI_OWNER, SkID);
    UTIL_setAttr(bar, ATTR_.CGXUI, UI_.BAR);

    const badge = D.createElement('span');
    UTIL_setAttr(badge, ATTR_.CGXUI_OWNER, SkID);
    UTIL_setAttr(badge, ATTR_.CGXUI, UI_.BADGE);
    UTIL_setAttr(badge, ATTR_.CGXUI_PART, 'badge');

    const label = D.createElement('span');
    UTIL_setAttr(label, ATTR_.CGXUI_OWNER, SkID);
    UTIL_setAttr(label, ATTR_.CGXUI, UI_.LABEL);
    UTIL_setAttr(label, ATTR_.CGXUI_PART, 'label');
    label.textContent = 'TITLE';

    const text = D.createElement('span');
    UTIL_setAttr(text, ATTR_.CGXUI_OWNER, SkID);
    UTIL_setAttr(text, ATTR_.CGXUI, UI_.TEXT);
    UTIL_setAttr(text, ATTR_.CGXUI_PART, 'text');
    text.textContent = '…';

    bar.appendChild(badge);
    bar.appendChild(label);
    bar.appendChild(text);

    const firstChild = msgEl.firstElementChild;
    if (firstChild) msgEl.insertBefore(bar, firstChild);
    else msgEl.appendChild(bar);

    return bar;
  };

  const DOM_setTitleOnAnswer = (msgEl, title) => {
    const bar = DOM_ensureTitleBar(msgEl);
    const labelEl = bar.querySelector(DOM_selScoped(UI_.LABEL));
    const turnNum = DOM_getTurnNumber(msgEl);
    if (labelEl) labelEl.textContent = turnNum > 0 ? `TITLE ${turnNum}` : 'TITLE';

    const id = DOM_getAnswerId(msgEl);
    if (id) {
      UTIL_setAttr(bar, 'data-answer-id', id); // internal marker (owned node)
      DOM_enableTitleEditing(bar, id);
    }
    const textEl = bar.querySelector(DOM_selScoped(UI_.TEXT));
    if (textEl && title) textEl.textContent = title;
    return bar;
  };

  const DOM_enableTitleEditing = (bar, answerId) => {
    if (!answerId) return;
    if (UTIL_getAttr(bar, ATTR_.CGXUI_STATE) === 'editable') return;
    UTIL_setAttr(bar, ATTR_.CGXUI_STATE, 'editable');

    const span = bar.querySelector(DOM_selScoped(UI_.TEXT));
    if (!span) return;

    const onClick = (e) => {
      try { e.stopPropagation(); } catch {}
      DOM_startTitleEdit(span, answerId);
    };

    span.addEventListener('click', onClick);
    STATE_.clean.listeners.push(() => span.removeEventListener('click', onClick));
  };

  const DOM_startTitleEdit = (span, answerId) => {
    if (!answerId) return;

    span.contentEditable = 'true';
    span.focus();

    try {
      const range = D.createRange();
      range.selectNodeContents(span);
      const sel = W.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {}

    const finish = (commit = true) => {
      span.contentEditable = 'false';
      span.removeEventListener('blur', onBlur);
      span.removeEventListener('keydown', onKey);
      if (!commit) return;

      const newTitle = UTIL_textTrim(span.textContent);

      // Empty => clear override (fall back)
      if (!newTitle) {
        delete STATE_.titles[answerId];
        ENGINE_saveTitles(STATE_.titles);
        UTIL_dispatch(EV_.TITLE_SET_LEG, { answerId, title: '' });
        UTIL_dispatch(EV_.TITLE_SET,     { answerId, title: '' });
        return;
      }

      STATE_.titles[answerId] = newTitle;
      ENGINE_saveTitles(STATE_.titles);

      // broadcast both (legacy + canonical)
      UTIL_dispatch(EV_.TITLE_SET_LEG, { answerId, title: newTitle });
      UTIL_dispatch(EV_.TITLE_SET,     { answerId, title: newTitle });
    };

    const onBlur = () => finish(true);

    const onKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        const stored = STATE_.titles[answerId];
        if (stored) span.textContent = stored;
        finish(false);
      }
    };

    span.addEventListener('blur', onBlur);
    span.addEventListener('keydown', onKey);
  };

  // Best-effort MiniMap DOM sync (no hard dependency; events + shared store are the real contract)
  const DOM_tryUpdateMiniMap = (answerId, title) => {
    try {
      // Legacy selectors from older MiniMap versions (kept as optional compat)
      const candidates = [
        '.ho-mm-btn',
        '[data-ho-mm-btn]',
        '[data-cgxui="mm-btn"]',
        '[data-cgxui="minimap-btn"]',
      ];
      for (const sel of candidates) {
        const nodes = D.querySelectorAll(sel);
        for (const n of nodes) {
          const did =
            n.dataset?.id ||
            n.dataset?.hoId ||
            UTIL_getAttr(n, 'data-id') ||
            UTIL_getAttr(n, ATTR_.MSG_ID);

          if (did === answerId) {
            n.textContent = title || n.textContent;
            UTIL_setAttr(n, ATTR_.TITLE, title || '');
            return true;
          }
        }
      }
    } catch {}
    return false;
  };

  /* ───────────────────────────── 🟪 UI BOUNDARY — CSS RULES / STYLE DEFINITIONS 📄🔓💧 ───────────────────────────── */

  function CSS_AT_text() {
    const selScoped = (ui) => `[${ATTR_.CGXUI}="${ui}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`;

    const S_BAR   = selScoped(UI_.BAR);
    const S_LABEL = selScoped(UI_.LABEL);
    const S_TEXT  = selScoped(UI_.TEXT);
    const S_BADGE = selScoped(UI_.BADGE);

    // NOTE: we also style a host-class on assistant msg for RTL (feature needs it)
    const HOST_RTL = `.cgxui-${SkID}-rtl-answer`;

    return `
${S_BAR}{
  display: inline-flex !important;
  align-items: center;
  justify-content: flex-start;
  max-width: max-content !important;
  width: auto !important;
  align-self: flex-start !important;
  text-align: left !important;

  font-size: 0.80rem;
  font-weight: 600;
  padding: 4px 8px;
  margin-bottom: 4px;
  border-radius: 8px;

  opacity: 0.9;
  background: linear-gradient(90deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02));
  border: 1px solid rgba(255,255,255,0.07);

  gap: 6px;
}

${S_LABEL}{
  text-transform: uppercase;
  font-size: 0.68rem;
  opacity: 0.7;
  letter-spacing: 0.06em;
}

${S_TEXT}{
  font-size: 0.80rem;
  font-weight: 600;
  text-align: left !important;
  cursor: text;
}

${S_BADGE}{
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #facc15;
  box-shadow: 0 0 6px rgba(250, 204, 21, 0.8);
}

${HOST_RTL}{
  direction: rtl !important;
  text-align: right !important;
}

/* Keep the title bar readable even inside RTL answers */
${HOST_RTL} > ${S_BAR}{
  direction: ltr !important;
  text-align: left !important;
}
`;
  }

  /* ───────────────────────────── 🟪 UI BOUNDARY — CSS INJECTOR 📝🔓💥 ───────────────────────────── */

  const UI_ensureStyle = () => {
    try {
      let styleEl = D.getElementById(CSS_.STYLE_ID);
      if (!styleEl) {
        styleEl = D.createElement('style');
        styleEl.id = CSS_.STYLE_ID;
        UTIL_setAttr(styleEl, ATTR_.CGXUI_OWNER, SkID);
        D.head.appendChild(styleEl);
      }
      const css = CSS_AT_text();
      if (styleEl.textContent !== css) styleEl.textContent = css;
      STATE_.clean.styleEl = styleEl;
    } catch (e) { DIAG_err('css:ensure', e); }
  };

  /* ───────────────────────────── 🟨 TIME — SCHEDULING / REACTIVITY 📝🔓💥 ───────────────────────────── */

  const TIME_queueProcessAnswer = (msgEl, attempt = 0) => {
    const id = DOM_getAnswerId(msgEl);
    if (!id) return;
    if (STATE_.seen.has(id)) return;

    const existing = STATE_.pendingTimers.get(id);
    if (existing) { try { clearTimeout(existing); } catch {} }

    const timerId = setTimeout(() => { ENGINE_processAnswer(msgEl, attempt); }, CFG_.DEBOUNCE_MS);
    STATE_.pendingTimers.set(id, timerId);
  };

  const TIME_initialScan = () => {
    setTimeout(() => {
      DOM_getAssistantMessages().forEach(msgEl => TIME_queueProcessAnswer(msgEl, 0));
    }, CFG_.SCAN_DELAY_MS);
  };

  const TIME_startObserver = () => {
    const root = D.body;
    const mo = new MutationObserver((muts) => {
      try {
        for (const m of muts) {
          if (!m.addedNodes || !m.addedNodes.length) continue;
          m.addedNodes.forEach(node => {
            if (!(node instanceof HTMLElement)) return;
            if (node.matches?.(SEL_.ASSISTANT_MSG)) TIME_queueProcessAnswer(node, 0);
            const inner = node.querySelectorAll?.(SEL_.ASSISTANT_MSG);
            if (inner && inner.length) inner.forEach(el => TIME_queueProcessAnswer(el, 0));
          });
        }
      } catch (e) { DIAG_err('mo:cb', e); }
    });

    mo.observe(root, { childList: true, subtree: true });
    STATE_.clean.mo = mo;
  };

  const TIME_startRepairLoop = () => {
    const intId = setInterval(() => {
      try {
        const textEls = D.querySelectorAll(SEL_.OWNED_TEXT_ANY);
        textEls.forEach((textEl) => {
          const bar = textEl.closest(SEL_.OWNED_BAR_ANY);
          const msgEl = textEl.closest(SEL_.ASSISTANT_MSG);
          if (!bar || !msgEl) return;

          const id = DOM_getAnswerId(msgEl);
          if (!id) return;

          const fullTextNow = DOM_getAnswerText(msgEl);
          ENGINE_applyRtlIfArabic(msgEl, fullTextNow);

          const manual = STATE_.titles[id];
          if (manual) {
            if (UTIL_textTrim(textEl.textContent) !== manual) {
              textEl.textContent = manual;
              DOM_tryUpdateMiniMap(id, manual);
            }
            return;
          }

          const current = UTIL_textTrim(textEl.textContent);
          if (!current || current === 'Untitled Answer' || /^\d+$/.test(current)) {
            if (!fullTextNow || fullTextNow.length < CFG_.REPAIR_TEXT_MIN) return;
            const better = ENGINE_generateLocalTitle(fullTextNow);
            if (!ENGINE_isGarbageTitle(better) && better !== current) {
              textEl.textContent = better;
              STATE_.titles[id] = better;
              ENGINE_saveTitles(STATE_.titles);
              DOM_tryUpdateMiniMap(id, better);
              UTIL_dispatch(EV_.TITLE_SET, { answerId: id, title: better });
            }
          }
        });
      } catch (e) { DIAG_err('repair:tick', e); }
    }, CFG_.REPAIR_EVERY_MS);

    STATE_.clean.repairInt = intId;
  };

  /* ───────────────────────────── 🟦 SURFACE — EVENTS / API / PORTS 📄🔒💧 ───────────────────────────── */

  // Public entrypoints (internal callable; external via events only)
  // - evt:h2o:title:set  (canonical)
  // - ho:title:set       (legacy)

  /* ───────────────────────────── ⚫️ LIFECYCLE — INIT / WIRING / STARTUP 📝🔓💥 ───────────────────────────── */

  function CORE_AT_boot() {
    if (STATE_.booted) {
      // idempotent: refresh css + reload store (safe)
      UI_ensureStyle();
      STATE_.titles = ENGINE_loadTitles();
      DIAG_step('boot:noop', { already: true });
      return;
    }
    STATE_.booted = true;

    DIAG_step('boot:start', { ver: '2.0.0', pid: PID });

    UI_ensureStyle();

    ENGINE_migrateTitlesOnce();
    STATE_.titles = ENGINE_loadTitles();

    // Listen for external title changes (MiniMap popup or other modules)
    const onTitle = (e) => {
      try {
        const d = e && e.detail ? e.detail : {};
        const answerId = d.answerId;
        if (!answerId) return;
        const clean = UTIL_textTrim(d.title);

        if (!clean) delete STATE_.titles[answerId];
        else STATE_.titles[answerId] = clean;

        ENGINE_saveTitles(STATE_.titles);

        // Update answer header
        const msgEl =
          D.querySelector(`[${ATTR_.ROLE}="assistant"][${ATTR_.MSG_ID}="${answerId}"]`) ||
          D.querySelector(`[${ATTR_.ROLE}="assistant"][${ATTR_.HO_ID}="${answerId}"]`);
        if (msgEl) {
          const full = DOM_getAnswerText(msgEl);
          ENGINE_applyRtlIfArabic(msgEl, full);
          const titleNow = clean || ENGINE_generateLocalTitle(full);
          DOM_setTitleOnAnswer(msgEl, titleNow);
        }

        // Best-effort minimap DOM sync
        DOM_tryUpdateMiniMap(answerId, clean || STATE_.titles[answerId] || '');
      } catch (err) { DIAG_err('ev:title:handler', err); }
    };

    W.addEventListener(EV_.TITLE_SET_LEG, onTitle);
    W.addEventListener(EV_.TITLE_SET, onTitle);
    STATE_.clean.listeners.push(() => W.removeEventListener(EV_.TITLE_SET_LEG, onTitle));
    STATE_.clean.listeners.push(() => W.removeEventListener(EV_.TITLE_SET, onTitle));

    // Start TIME layer
    TIME_initialScan();
    TIME_startObserver();
    TIME_startRepairLoop();

    DIAG_step('boot:done', { ok: true });
  }

  /* ───────────────────────────── ⚪️ LIFECYCLE — DISPOSE / CLEANUP 📝🔓💥 ───────────────────────────── */

  function CORE_AT_dispose() {
    if (!STATE_.booted) return;
    STATE_.booted = false;

    DIAG_step('dispose:start', {});

    // Stop observer
    try { STATE_.clean.mo?.disconnect?.(); } catch {}
    STATE_.clean.mo = null;

    // Stop interval
    try { if (STATE_.clean.repairInt) clearInterval(STATE_.clean.repairInt); } catch {}
    STATE_.clean.repairInt = null;

    // Clear pending timers
    try {
      for (const t of STATE_.pendingTimers.values()) { try { clearTimeout(t); } catch {} }
      STATE_.pendingTimers.clear();
    } catch {}

    // Remove owned UI
    try {
      const bars = D.querySelectorAll(SEL_.OWNED_BAR_ANY);
      bars.forEach(n => { try { n.remove(); } catch {} });
    } catch {}

    // Remove injected style
    try { STATE_.clean.styleEl?.remove?.(); } catch {}
    STATE_.clean.styleEl = null;

    // Remove listeners
    try { (STATE_.clean.listeners || []).forEach(fn => { try { fn(); } catch {} }); } catch {}
    STATE_.clean.listeners = [];

    // Revert RTL mutations on host nodes (dir + class)
    try {
      STATE_.mutatedMsgs.forEach((msgEl) => {
        try { msgEl.classList.remove(`cgxui-${SkID}-rtl-answer`); } catch {}
        try { UTIL_delAttr(msgEl, ATTR_.DIR); } catch {}
      });
      STATE_.mutatedMsgs.clear();
    } catch {}

    DIAG_step('dispose:done', { ok: true });
  }

  // Engine function depends on TIME helpers (placed after TIME section)
  async function ENGINE_processAnswer(msgEl, attempt = 0) {
    const id = DOM_getAnswerId(msgEl);
    if (!id) return;

    const text = DOM_getAnswerText(msgEl);

    // Apply RTL early
    ENGINE_applyRtlIfArabic(msgEl, text);

    // Retry while streaming
    if (!text || text.length < CFG_.RETRY_TEXT_MIN) {
      if (attempt < CFG_.RETRY_MAX) {
        TIME_queueProcessAnswer(msgEl, attempt + 1);
      } else {
        const localTitle = ENGINE_generateLocalTitle(text || '');
        const stored = STATE_.titles[id];
        const finalTitle = stored || localTitle;
        DOM_setTitleOnAnswer(msgEl, finalTitle);

        STATE_.titles[id] = finalTitle;
        ENGINE_saveTitles(STATE_.titles);

        DOM_tryUpdateMiniMap(id, finalTitle);
        UTIL_dispatch(EV_.TITLE_SET, { answerId: id, title: finalTitle });

        STATE_.seen.add(id);
      }
      return;
    }

    try { STATE_.pendingTimers.delete(id); } catch {}
    if (STATE_.seen.has(id)) return;
    STATE_.seen.add(id);

    const localTitle = ENGINE_generateLocalTitle(text);
    const apiTitle = await ENGINE_generateApiTitle(text);
    const stored = STATE_.titles[id];
    const finalTitle = stored || apiTitle || localTitle;

    DOM_setTitleOnAnswer(msgEl, finalTitle);

    // Persist + broadcast as the real sync contract (MiniMap/Dock can consume)
    STATE_.titles[id] = finalTitle;
    ENGINE_saveTitles(STATE_.titles);

    DOM_tryUpdateMiniMap(id, finalTitle);
    UTIL_dispatch(EV_.TITLE_SET, { answerId: id, title: finalTitle });
  }

  /* ───────────────────────────── AUTO-START (minimal) ───────────────────────────── */

  // Start effects only via lifecycle entrypoint
  CORE_AT_boot();

  // Optional public handles (rare; internal only)
  MOD_OBJ.port = MOD_OBJ.port || {};
  MOD_OBJ.port.boot = CORE_AT_boot;
  MOD_OBJ.port.dispose = CORE_AT_dispose;

})();
