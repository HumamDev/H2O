// ==H2O Module==
// @h2o-id             1c1a.answer.title
// @name               1C1a.🟥📛 Turn Title Bar 📛
// @namespace          H2O.Premium.CGX.answer.title
// @author             HumamDev
// @version            3.0.2
// @revision           001
// @build              260412-235902
// @description        Auto-generate titles for ChatGPT answers + inline editable header; collapse/expand on double-click; sync via shared titles store + events (Contract v2.0 Stage-1).
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

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
    HO_ID: 'data-ho-id',
    CGXUI: 'data-cgxui',
    CGXUI_OWNER: 'data-cgxui-owner',
    CGXUI_STATE: 'data-cgxui-state',
    CGXUI_PART: 'data-cgxui-part',
    DIR: 'dir',
    TITLE: 'title',
    COLLAPSED: 'data-at-collapsed',  // NEW: collapse state on the answer message element
  });

  /* [DEFINE][STORE][API] Namespaces (boundary-only use of DsID) */
  const NS_ = Object.freeze({
    DISK: `h2o:${SUITE}:${HOST}:${DsID}`,
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
    // API disabled by default (CSP-safe)
    USE_API: false,
    OPENAI_API_KEY: '',
    OPENAI_MODEL: 'gpt-4o-mini',
    API_MIN_TEXT: 20,
    // NEW: collapse animation
    COLLAPSE_TRANSITION_MS: 220,
  });

  /* [DEFINE][UI] SkID-based UI token strings */
  const UI_ = Object.freeze({
    BAR:   `${SkID}-answer-title`,
    TEXT:  `${SkID}-answer-title-text`,
    LABEL: `${SkID}-answer-title-label`,
    BADGE: `${SkID}-answer-title-badge`,
    ICON:  `${SkID}-answer-title-icon`,   // NEW: collapse chevron icon
  });

  /* [DEFINE][CSS] Style id */
  const CSS_ = Object.freeze({
    STYLE_ID: `cgxui-${SkID}-style`,
  });

  /* [DEFINE][EV] Event topics (canonical + legacy) */
  const EV_ = Object.freeze({
    TITLE_SET:       'evt:h2o:title:set',
    TITLE_SET_LEG:   'ho:title:set',
    ANSWER_COLLAPSE: 'evt:h2o:answer:collapse',  // NEW: emitted on collapse/expand
  });

  /* [DEFINE][STORE] Keys (shared + migrate) */
  const KEY_ = Object.freeze({
    MNMP_STATE_TITLES_V1: `h2o:${SUITE}:${HOST}:mnmp:state:titles:v1`,
    LEG_TITLES_OLD_V1: 'ho:answerTitles.v1',
    MIG_TITLES_V1: `${NS_.DISK}:migrate:titles:v1`,
    COLLAPSED_V1: `${NS_.DISK}:collapsed:v1`,   // NEW: persist collapse state
  });

  const UI_CFG_ = Object.freeze({
    KEY: `${NS_.DISK}:cfg:ui:v1`,
    DEFAULTS: Object.freeze({
      collapsedTextMode: 'adaptive', // adaptive = per-wash black/white, consistent = fixed text color
    }),
    COLLAPSED_TEXT_MODES: Object.freeze(['adaptive', 'consistent']),
  });

  // Extend shared registries (first-wins)
  UTIL_extendRegistry(H2O.KEYS, { MNMP_STATE_TITLES_V1: KEY_.MNMP_STATE_TITLES_V1 }, `[${MODTAG}]`);
  UTIL_extendRegistry(H2O.EV,   { TITLE_SET: EV_.TITLE_SET }, `[${MODTAG}]`);

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

  const UI_AT_normalizeCfg = (raw) => {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const collapsedTextMode = String(src.collapsedTextMode || UI_CFG_.DEFAULTS.collapsedTextMode).trim().toLowerCase();
    return {
      collapsedTextMode: UI_CFG_.COLLAPSED_TEXT_MODES.includes(collapsedTextMode)
        ? collapsedTextMode
        : UI_CFG_.DEFAULTS.collapsedTextMode,
    };
  };

  const UI_AT_readCfg = () => {
    try { return UI_AT_normalizeCfg(JSON.parse(localStorage.getItem(UI_CFG_.KEY) || '{}') || {}); } catch { return UI_AT_normalizeCfg(null); }
  };

  const UI_AT_writeCfg = (next) => {
    const cfg = UI_AT_normalizeCfg(next);
    try { localStorage.setItem(UI_CFG_.KEY, JSON.stringify(cfg)); } catch {}
    return cfg;
  };

  const UI_AT_applyCfg = () => {
    const cfg = UI_AT_readCfg();
    try {
      D.documentElement?.setAttribute?.('data-cgxui-at-collapsed-text-mode', cfg.collapsedTextMode || UI_CFG_.DEFAULTS.collapsedTextMode);
    } catch {}
    return cfg;
  };

  /* ───────────────────────────── 🔴 STATE — REGISTRIES / CACHES 📄🔓💧 ───────────────────────────── */

  const STATE_ = MOD_OBJ.state = MOD_OBJ.state || {};

  STATE_.booted = STATE_.booted || false;

  STATE_.seen = STATE_.seen || new Set();
  STATE_.pendingTimers = STATE_.pendingTimers || new Map();
  STATE_.mutatedMsgs = STATE_.mutatedMsgs || new Set();

  STATE_.titles = STATE_.titles || {};
  STATE_.collapsed = STATE_.collapsed || new Set(); // NEW: track collapsed answer ids
  STATE_.titleIntentLastApplied = STATE_.titleIntentLastApplied || new Map();
  STATE_.visitResetPending = STATE_.visitResetPending || false;

  STATE_.clean = STATE_.clean || {
    mo: null,
    repairInt: null,
    listeners: [],
    styleEl: null,
  };


/* Phase 2 public API seam for Chat Pages Controller */

  /* ───────────────────────────── 🟥 ENGINE — DOMAIN LOGIC / PIPELINE 📝🔓💥 ───────────────────────────── */

  // ─── ENHANCED STOPWORDS ─── (expanded to ~200 words across EN/DE/FR/ES/AR)
  const STOPWORDS = new Set([
    // English
    'the','and','or','but','so','for','yet','nor','a','an','in','on','at','to','of',
    'by','as','is','are','was','were','be','been','being','have','has','had','do',
    'does','did','will','would','could','should','may','might','shall','can','need',
    'i','you','he','she','it','we','they','me','him','her','us','them','my','your',
    'his','its','our','their','this','that','these','those','with','from','into',
    'about','than','then','when','where','which','who','what','how','why','if','up',
    'out','no','not','also','just','more','some','such','very','too','now','here',
    'there','all','any','both','each','few','many','much','other','same','than',
    'own','over','after','before','between','through','during','without','within',
    'against','along','following','across','behind','beyond','plus','except','up',
    // German
    'weil','und','oder','aber','ich','du','er','sie','wir','ihr','das','ist','ein',
    'eine','einer','einem','einen','der','die','den','dem','des','zu','auf','im',
    'am','vom','zum','bei','mit','von','nach','vor','unter','über','aus','hat',
    'haben','war','wurde','wird','kann','muss','soll','wenn','dass','damit','auch',
    'noch','schon','nur','dann','jetzt','hier','dort','alle','als','wie','was',
    // French
    'le','la','les','un','une','des','du','de','et','en','au','aux','je','tu',
    'il','elle','nous','vous','ils','elles','ce','se','sa','son','ses','mon','ton',
    'pas','plus','sur','par','pour','qui','que','quoi','dont','où',
    // Spanish
    'el','los','las','una','unos','unas','del','al','me','te','lo','nos','os',
    'se','mi','tu','su','es','son','está','han','fue','será',
    // Arabic common particles (latin-transliterated stopwords for keyword extraction from mixed text)
    'في','من','إلى','على','عن','مع','هو','هي','هم','أن','كان','لا','ما',
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

  const ENGINE_isUnmountEngineMode = () => {
    try {
      const router = W.top?.H2O?.CM?.chtmech?.api || W.H2O?.CM?.chtmech?.api || null;
      return !!router?.isEngineGestureBackend?.();
    } catch { return false; }
  };


  const ENGINE_getUnmountApi = () => {
    try { return W.top?.H2O?.UM?.nmntmssgs?.api || W.H2O?.UM?.nmntmssgs?.api || null; } catch { return null; }
  };

  const TITLE_INTENT_API = () => {
    try {
      return W.top?.H2O?.ChatPageTitleIntent?.api
        || W.H2O?.ChatPageTitleIntent?.api
        || null;
    } catch { return null; }
  };

  const TITLE_INTENT_isActiveDesired = (desired = null) => {
    return !!desired && Number(desired.rev || 0) > 0
      && (desired.source === 'page-intent' || desired.source === 'manual');
  };

  const TITLE_INTENT_projectionMatches = (bar, desired = null) => {
    if (!bar || !desired) return false;
    return String(bar.getAttribute?.('data-h2o-title-desired') || '') === String(desired.state || '')
      && String(bar.getAttribute?.('data-h2o-title-state-source') || '') === String(desired.source || '')
      && Number(bar.getAttribute?.('data-h2o-title-rev') || 0) === Math.max(0, Number(desired.rev || 0) || 0);
  };

  const TITLE_INTENT_actualState = (msgEl = null, bar = null) => {
    if (!msgEl || !bar) return null;
    const msgCollapsed = UTIL_getAttr(msgEl, ATTR_.COLLAPSED) === '1';
    const barCollapsed = String(UTIL_getAttr(bar, ATTR_.CGXUI_STATE) || '').split(/\s+/).includes('collapsed');
    return (msgCollapsed || barCollapsed) ? 'collapsed' : 'expanded';
  };

  const TITLE_INTENT_stampProjection = (bar, answerId, desired) => {
    if (!bar || !answerId || !desired) return false;
    try {
      bar.setAttribute('data-h2o-title-answer-id', String(answerId));
      if (desired.page != null) bar.setAttribute('data-h2o-title-page', String(desired.page));
      else bar.removeAttribute('data-h2o-title-page');
      bar.setAttribute('data-h2o-title-desired', String(desired.state || 'expanded'));
      bar.setAttribute('data-h2o-title-state-source', String(desired.source || 'default'));
      bar.setAttribute('data-h2o-title-rev', String(Math.max(0, Number(desired.rev || 0) || 0)));
      bar.setAttribute('data-h2o-title-hydrated', '1');
      return true;
    } catch { return false; }
  };

  const TITLE_INTENT_applyProjection = (answerId, msgEl = null, bar = null, opts = {}) => {
    const id = API_AT_normalizeAnswerId(answerId || DOM_getAnswerId(msgEl));
    if (!id) return null;
    const api = TITLE_INTENT_API();
    if (!api || typeof api.resolveDesiredTitleState !== 'function') return null;
    // Central gate: O(1) cached check with zero storage IO. This runs on hot
    // paths (mutation reconcile, per-bar sync) thousands of times during
    // chat-open hydration — while no page intent or override exists it must
    // return before doing ANY bridge resolution or DOM work. A missing or
    // failing gate means an older bridge — treat as inactive, never as "go".
    try { if (api.isTitleIntentEngineActive?.() !== true) return null; } catch { return null; }
    let desired = null;
    try { desired = api.resolveDesiredTitleState(id); } catch { desired = null; }
    if (!desired) return null;
    if (!TITLE_INTENT_isActiveDesired(desired)) return desired;
    const liveMsgEl = msgEl || API_AT_getMessageEl(id);
    const liveBar = bar || API_AT_getBar(id);
    const applyKey = `${id}:${desired.state}:${desired.source}:${Math.max(0, Number(desired.rev || 0) || 0)}`;
    const actualState = TITLE_INTENT_actualState(liveMsgEl, liveBar);
    if (actualState === desired.state
      && TITLE_INTENT_projectionMatches(liveBar, desired)
      && STATE_.titleIntentLastApplied.get(id) === applyKey) {
      return desired;
    }
    TITLE_INTENT_stampProjection(liveBar, id, desired);
    if (!liveMsgEl || !liveBar) return desired;
    if (actualState === desired.state) {
      STATE_.titleIntentLastApplied.set(id, applyKey);
      return desired;
    }
    const collapsed = String(desired.state || '') === 'collapsed';
    DOM_applyCollapseState(liveMsgEl, liveBar, collapsed, opts?.animate === true);
    STATE_.titleIntentLastApplied.set(id, applyKey);
    return desired;
  };

  const TITLE_INTENT_recordManual = (answerId, collapsed, source = 'answer-title') => {
    const id = API_AT_normalizeAnswerId(answerId);
    if (!id) return false;
    try {
      const api = TITLE_INTENT_API();
      return !!api?.recordManualTitleOverride?.(id, collapsed ? 'collapsed' : 'expanded', { source });
    } catch { return false; }
  };

  const ENGINE_readUnmountCollapsed = (answerId, fallback = null, opts = {}) => {
    const id = API_AT_normalizeAnswerId(answerId);
    if (!id) return fallback;
    const api = ENGINE_getUnmountApi();
    const requestedSources = Array.isArray(opts?.sources)
      ? opts.sources.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
      : [];

    if (requestedSources.length && typeof api?.getManualCollapsedIds === 'function') {
      let anyRead = false;
      for (const source of requestedSources) {
        try {
          const ids = api.getManualCollapsedIds({ source });
          if (!Array.isArray(ids)) continue;
          anyRead = true;
          if (ids.includes(id)) return true;
        } catch {}
      }
      return anyRead ? false : fallback;
    }

    try {
      if (typeof api?.isCollapsedById === 'function') return !!api.isCollapsedById(id);
    } catch {}
    try {
      if (typeof api?.getManualCollapsedIds === 'function') {
        const ids = api.getManualCollapsedIds();
        if (Array.isArray(ids)) return ids.includes(id);
      }
    } catch {}
    return fallback;
  };

  const ENGINE_readUnmountTitleShellCollapsed = (answerId, fallback = null) => {
    return ENGINE_readUnmountCollapsed(answerId, fallback, {
      sources: ['answer-title', 'title-list-row'],
    });
  };

  const ENGINE_loadCollapsed = () => {
    // In engine mode, the Unmount adapter is the sole owner of collapse state.
    // Title Bar must not independently persist/restore collapse to avoid dual-truth conflicts.
    if (ENGINE_isUnmountEngineMode()) return new Set();
    try {
      const raw = UTIL_storage.getStr(KEY_.COLLAPSED_V1, null);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? new Set(arr) : new Set();
    } catch { return new Set(); }
  };

  const ENGINE_saveCollapsed = () => {
    if (ENGINE_isUnmountEngineMode()) return;
    try { UTIL_storage.setJSON(KEY_.COLLAPSED_V1, Array.from(STATE_.collapsed)); }
    catch (e) { DIAG_err('store:saveCollapsed', e); }
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
    // All non-letter/digit characters
    if (/^[\d\W]+$/.test(s)) return true;
    // Too short to be meaningful
    if (s.length < 8) return true;
    // Single word that's also a stopword
    const words = s.split(/\s+/);
    if (words.length === 1 && STOPWORDS.has(s.toLowerCase())) return true;
    // Almost entirely punctuation/numbers
    const letterRatio = (s.match(/\p{L}/gu) || []).length / s.length;
    if (letterRatio < 0.4) return true;
    return false;
  };

  // ─── ENHANCED: extractExplicitHeading ───
  // Scans more lines, handles more patterns (bold markdown, all-caps headers,
  // numbered list headers, colon-prefixed headers), strips markdown artifacts
  const ENGINE_extractExplicitHeading = (text) => {
    const lines = String(text || '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .slice(0, 12);  // ENHANCED: scan first 12 lines (was 5)

    for (const line of lines) {
      if (line.length < 6) continue;

      let cand = line;

      // ENHANCED: strip markdown heading markers (## Heading)
      cand = cand.replace(/^#{1,6}\s+/, '');

      // ENHANCED: strip bold markers (**text** or __text__)
      cand = cand.replace(/^\*{1,2}(.+?)\*{1,2}$/, '$1');
      cand = cand.replace(/^_{1,2}(.+?)_{1,2}$/, '$1');

      // ENHANCED: strip numbered/bulleted list markers
      cand = cand.replace(/^\s*(?:\d+[.)]\s+|[-*•]\s+)/, '');

      // Cut at structural separators
      const dashIdx = cand.indexOf('—');
      const hyIdx   = cand.indexOf(' - ');
      const colIdx  = cand.indexOf(':');
      let cutIdx = -1;
      if (dashIdx !== -1) cutIdx = dashIdx;
      else if (hyIdx !== -1) cutIdx = hyIdx;
      else if (colIdx !== -1 && colIdx < cand.length - 3) cutIdx = colIdx; // ENHANCED: ensure colon isn't last char

      // For colon, take the part BEFORE as a potential label (e.g. "Summary: ..." → "Summary")
      // But only if before-part is short and meaningful
      if (cutIdx !== -1 && cutIdx === colIdx) {
        const before = cand.slice(0, colIdx).trim();
        const after  = cand.slice(colIdx + 1).trim();
        // If the before-part is a meaningful label (2–5 words), prefer the after part
        const beforeWords = before.split(/\s+/).length;
        if (beforeWords >= 2 && beforeWords <= 5 && after.length >= 8) {
          cand = after;
        } else {
          cand = cand.slice(cutIdx + 1);
        }
      } else if (cutIdx !== -1) {
        cand = cand.slice(cutIdx + 1);
      }

      // Strip leading/trailing non-letter/digit characters
      cand = cand
        .replace(/^[^\p{L}\p{N}]+/gu, '')
        .replace(/[^\p{L}\p{N}]+$/gu, '')
        .trim();

      // Strip wrapping quotes
      cand = cand.replace(/^["'""]+|["'""]+$/g, '').trim();

      if (!cand) continue;
      if (cand.length < 6 || cand.length > 120) continue;

      const words = cand.split(/\s+/);
      if (words.length < 2) continue;

      // ENHANCED: Accept if has any uppercase letter OR is non-Latin (Arabic/CJK) script
      const hasUppercase = /[A-ZÄÖÜÀÂÉÈÊÙÛÔÎÇÆŒ\u0041-\u005A]/.test(cand);
      const hasNonLatin  = /[\u0600-\u06FF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/.test(cand);
      if (!hasUppercase && !hasNonLatin) continue;

      // ENHANCED: also accept all-caps lines (acronyms, headers without mixed case)
      return cand;
    }
    return null;
  };

  // ─── ENHANCED: buildKeywordTitle ───
  // Position-weighted (words earlier in text score higher),
  // n-gram (bigram) support for named entity recognition,
  // length-bonus for longer meaningful words
  const ENGINE_buildKeywordTitle = (text) => {
    const normalized = String(text || '')
      .replace(/[^\p{L}\s]/gu, ' ');

    const rawWords = normalized
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w && !STOPWORDS.has(w) && w.length >= 3);

    if (!rawWords.length) return null;

    // Build unigram frequency map with position decay (earlier = higher weight)
    const totalWords = rawWords.length;
    const freq = {};
    rawWords.forEach((w, i) => {
      const posWeight = 1 + (1 - i / totalWords) * 1.5; // 1.0–2.5 range, first words get 2.5×
      const lenBonus  = Math.min(1.5, 0.8 + w.length * 0.07); // longer words get slight bonus
      freq[w] = (freq[w] || 0) + posWeight * lenBonus;
    });

    // ENHANCED: detect bigrams (adjacent meaningful words both not stopwords)
    // A bigram scores as sum of its parts * 1.6 (compound boost)
    const bigrams = {};
    rawWords.forEach((w, i) => {
      if (i === rawWords.length - 1) return;
      const next = rawWords[i + 1];
      const key = `${w} ${next}`;
      bigrams[key] = (bigrams[key] || 0) + (freq[w] || 0) + (freq[next] || 0) * 1.6;
    });

    // Pick top bigram if it significantly outscores top unigram
    const topBigrams = Object.entries(bigrams)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);

    const topUnigrams = Object.keys(freq)
      .sort((a, b) => freq[b] - freq[a])
      .slice(0, 4);

    if (!topUnigrams.length) return null;

    // If top bigram exists and is strong, use it as the anchor phrase
    let anchor = '';
    let remainingSlots = 2;
    if (topBigrams.length && topBigrams[0][1] > (freq[topUnigrams[0]] || 0) * 1.2) {
      anchor = topBigrams[0][0].split(' ').map(UTIL_cap).join(' ');
      remainingSlots = 1;
    } else {
      anchor = UTIL_cap(topUnigrams[0]);
    }

    // Fill remaining slots with top unigrams not already in anchor
    const anchorLower = anchor.toLowerCase();
    const extras = topUnigrams
      .filter(w => !anchorLower.includes(w))
      .slice(0, remainingSlots);

    if (!extras.length) return anchor;
    if (extras.length === 1) return `${anchor} & ${UTIL_cap(extras[0])}`;
    return `${anchor}, ${UTIL_cap(extras[0])} & ${UTIL_cap(extras[1])}`;
  };

  // ─── ENHANCED: pickBestSentence ───
  // Scores all sentences by content-word density, topic-word bonus,
  // optimal length window, and position; returns the single best candidate
  const ENGINE_pickBestSentence = (text) => {
    const rawSentences = String(text || '')
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(Boolean);

    if (!rawSentences.length) return null;

    // Quick score: prefers sentences that are informative but not too long
    let best = null;
    let bestScore = -1;

    rawSentences.forEach((s, idx) => {
      if (s.length < 15) return;  // too short
      if (s.length > 300) return; // too long for a title

      const words = s.split(/\s+/);
      const contentWords = words.filter(w => {
        const clean = w.replace(/[^\p{L}]/gu, '').toLowerCase();
        return clean.length >= 4 && !STOPWORDS.has(clean);
      });

      if (contentWords.length < 3) return;

      // Score factors:
      // 1) Ratio of content words (density)
      const density = contentWords.length / Math.max(1, words.length);
      // 2) Length penalty if too long (prefer 8–20 word range)
      const lenScore = words.length >= 8 && words.length <= 20 ? 1.0 : 0.7;
      // 3) Position bonus: first 3 sentences get a boost
      const posBonus = idx < 3 ? (1.2 - idx * 0.1) : 1.0;
      // 4) Early return: a very good sentence in first 5 lines wins immediately
      const score = density * lenScore * posBonus * contentWords.length;

      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    });

    return best || rawSentences[0] || null;
  };

  const ENGINE_generateLocalTitle = (text) => {
    if (!text) return 'Untitled Answer';

    // Priority 1: Explicit heading (markdown header, bold title, numbered label, colon-prefix)
    let title = ENGINE_extractExplicitHeading(text);
    if (!ENGINE_isGarbageTitle(title)) return ENGINE_clipTitle(title);

    // Priority 2: Best keyword composite (position-weighted + bigram)
    title = ENGINE_buildKeywordTitle(text);
    if (!ENGINE_isGarbageTitle(title)) return ENGINE_clipTitle(title);

    // Priority 3: Best single sentence (scored)
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

  /* ───────────────────────────── 🟧 BOUNDARIES — DOM / IO ADAPTERS / MOUNT 📝🔓💥 ───────────────────────────── */

  /* [SEL] One selector registry block */
  const SEL_ = Object.freeze({
    ASSISTANT_MSG: `[${ATTR_.ROLE}="assistant"][${ATTR_.MSG_ID}]`,
    TURN: '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]',
    TURNS_ROOT: '[data-testid="conversation-turns"]',
    OWNED_BAR_ANY: `[${ATTR_.CGXUI}="${UI_.BAR}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`,
    OWNED_TEXT_ANY:`[${ATTR_.CGXUI}="${UI_.TEXT}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`,
  });

  const DOM_getAssistantMessages = () => Array.from(D.querySelectorAll(SEL_.ASSISTANT_MSG));

  const DOM_getAnswerId = (msgEl) => UTIL_getAttr(msgEl, ATTR_.MSG_ID) || null;

  const DOM_isPerfProbeLine = (line) => /__oai_(?:logHTML|logTTI|SSR_HTML|SSR_TTI)/.test(String(line || ''));

  // Layout contract: one title shell belongs to one complete Q+A turn. The
  // shell stays visible as the restore handle; collapse covers the question,
  // answer body, and related answer chrome. Page dividers/title-list logic must
  // anchor before this full turn and must not create NO ANSWER shells for the
  // question half of an answered turn.
  const DOM_isNoAnswerTitleBar = (bar = null) => String(bar?.getAttribute?.('data-at-no-answer') || '').trim() === '1';

  const DOM_removeNoAnswerTitleBars = (root = null) => {
    if (!root?.querySelectorAll) return 0;
    let removed = 0;
    try {
      for (const bar of Array.from(root.querySelectorAll(`${SEL_.OWNED_BAR_ANY}[data-at-no-answer="1"]`))) {
        try { bar.remove(); removed += 1; } catch {}
      }
      root.removeAttribute?.('data-cgxui-chat-page-no-answer');
      root.removeAttribute?.('data-cgxui-chat-page-no-answer-hidden');
      root.removeAttribute?.('data-cgxui-chat-page-no-answer-question-hidden');
    } catch {}
    return removed;
  };

  const DOM_removePairedNoAnswerTitleBars = (msgEl = null) => {
    if (!msgEl) return 0;
    let removed = 0;
    try { removed += DOM_removeNoAnswerTitleBars(DOM_getAnswerTurnHost(msgEl)); } catch {}
    try { removed += DOM_removeNoAnswerTitleBars(DOM_getQuestionTurnHost(msgEl)); } catch {}
    return removed;
  };

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

    return 0;
  };

  const DOM_selScoped = (uiToken) => `[${ATTR_.CGXUI}="${uiToken}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`;

  const DOM_resolvePrimaryAnswerId = (answerId) => {
    const id = API_AT_normalizeAnswerId(answerId);
    if (!id) return '';
    try {
      const rt = W.H2O?.turnRuntime || null;
      const record = rt?.getTurnRecordByAId?.(id) || rt?.getTurnRecordByTurnId?.(id) || null;
      const primary = API_AT_normalizeAnswerId(record?.primaryAId || record?.answerId || '');
      if (primary) return primary;
    } catch {}
    try {
      const primary = API_AT_normalizeAnswerId(W.H2O?.turn?.getPrimaryAIdByAId?.(id) || '');
      if (primary) return primary;
    } catch {}
    return id;
  };

  const DOM_resolveTurnNumberByAnswerId = (answerId) => {
    const id = API_AT_normalizeAnswerId(answerId);
    if (!id) return 0;
    try {
      const rt = W.H2O?.turnRuntime || null;
      const record = rt?.getTurnRecordByAId?.(id) || rt?.getTurnRecordByTurnId?.(id) || null;
      const turnNo = Math.max(0, Number(record?.turnNo || record?.idx || 0) || 0);
      if (turnNo) return turnNo;
    } catch {}
    return 0;
  };

  // Native hydration can briefly retain an older message shell while a new
  // shell for the same canonical answer is already live. Per-message dedup is
  // therefore insufficient: both bars can be connected, visible, and later
  // upgraded by the repair loop. The live/stack-selected bar wins; remove only
  // candidates whose answer identity resolves to the same canonical answer.
  // Turn number is a fallback solely for an unstamped candidate — never use a
  // stale number to merge two differently identified answers.
  const DOM_removeDuplicateTitleBarsForAnswer = (answerId, keepBar, msgEl = null) => {
    const id = API_AT_normalizeAnswerId(answerId);
    if (!id || !keepBar) return 0;
    const primaryId = DOM_resolvePrimaryAnswerId(id);
    const turnNo = Math.max(0, Number(
      DOM_getTurnNumber(msgEl) || DOM_resolveTurnNumberByAnswerId(id) || 0
    ) || 0);
    const meaningfulTitle = (bar) => {
      const text = UTIL_textTrim(
        bar?.querySelector?.(DOM_selScoped(UI_.TEXT))?.textContent || ''
      ).replace(/\s+/g, ' ');
      return (!text || /^(?:…|\.{2,}|untitled answer|answer(?:\s+\d+)?|\d+)$/i.test(text)) ? '' : text;
    };
    const candidateBars = new Set([keepBar]);
    const identityIds = new Set([id, primaryId].filter(Boolean));
    try {
      const rt = W.H2O?.turnRuntime || null;
      const record = rt?.getTurnRecordByAId?.(id)
        || rt?.getTurnRecordByTurnId?.(id)
        || (turnNo ? rt?.getTurnRecordByTurnNo?.(turnNo) : null)
        || null;
      for (const value of [
        record?.primaryAId,
        record?.answerId,
        record?.turnId,
        ...(Array.isArray(record?.answerIds) ? record.answerIds : []),
        ...(Array.isArray(record?._aliasIds) ? record._aliasIds : []),
      ]) {
        const familyId = API_AT_normalizeAnswerId(value);
        if (familyId) identityIds.add(familyId);
      }
    } catch {}
    // Indexed selectors keep the five-second repair O(answer aliases), not a
    // full-document title-bar scan for every hydrated answer.
    for (const familyId of identityIds) {
      try {
        const esc = (typeof CSS !== 'undefined' && CSS?.escape)
          ? CSS.escape(familyId)
          : familyId.replace(/(["\\])/g, '\\$1');
        for (const candidate of D.querySelectorAll(`${DOM_selScoped(UI_.BAR)}[data-answer-id="${esc}"]`)) {
          candidateBars.add(candidate);
        }
      } catch {}
    }
    if (turnNo > 0) {
      try {
        const S_BAR = DOM_selScoped(UI_.BAR);
        for (const candidate of D.querySelectorAll(
          `${S_BAR}:not([data-answer-id])[data-h2o-turn-num="${turnNo}"],`
            + `${S_BAR}[data-answer-id=""][data-h2o-turn-num="${turnNo}"],`
            + `${S_BAR}:not([data-answer-id])[data-h2o-stack-turn-no="${turnNo}"],`
            + `${S_BAR}[data-answer-id=""][data-h2o-stack-turn-no="${turnNo}"]`
        )) candidateBars.add(candidate);
      } catch {}
    }
    let recoveredTitle = meaningfulTitle(keepBar);
    let removed = 0;
    try {
      for (const candidate of candidateBars) {
        if (candidate === keepBar || !candidate?.isConnected || DOM_isNoAnswerTitleBar(candidate)) continue;
        const candidateId = API_AT_normalizeAnswerId(candidate.getAttribute('data-answer-id') || '');
        const candidateTurnNo = Math.max(0, Number(
          candidate.getAttribute('data-h2o-stack-turn-no')
            || candidate.getAttribute('data-h2o-turn-num')
            || 0
        ) || 0);
        const sameIdentity = candidateId
          ? DOM_resolvePrimaryAnswerId(candidateId) === primaryId
          : !!(turnNo && candidateTurnNo === turnNo);
        if (!sameIdentity) continue;
        if (!recoveredTitle) recoveredTitle = meaningfulTitle(candidate);
        try { candidate.remove(); removed += 1; } catch {}
      }
    } catch {}
    if (recoveredTitle && !meaningfulTitle(keepBar)) {
      try {
        const textEl = keepBar.querySelector(DOM_selScoped(UI_.TEXT));
        if (textEl) textEl.textContent = recoveredTitle;
        STATE_.titles[id] = recoveredTitle;
      } catch {}
    }
    if (turnNo > 0) {
      try { keepBar.setAttribute('data-h2o-turn-num', String(turnNo)); } catch {}
    }
    return removed;
  };

  // A title bar relocated into a page title-bar stack (Thread Pages
  // Controller) is still THE bar for its answer. Lookups must find it there
  // and must NOT re-home it or create a duplicate inside the message element
  // while the stack owns its placement.
  const DOM_findStackedBarByAnswerId = (answerId) => {
    const id = API_AT_normalizeAnswerId(answerId);
    if (!id) return null;
    try {
      const direct = D.querySelector(`[${ATTR_.CGXUI}="${UI_.BAR}"][data-answer-id="${CSS.escape(id)}"][data-h2o-in-title-stack]`);
      if (direct) return direct;
    } catch {}
    // Hydration aliases may differ from the canonical answer id stored in the
    // page ledger. Resolve identity before allowing DOM_ensureTitleBar to
    // create a second flow bar and replace the visible stacked instance.
    if (!D.querySelector('[data-cgxui="chat-page-title-list-synth"]')) return null;
    const primary = DOM_resolvePrimaryAnswerId(id);
    const turnNo = DOM_resolveTurnNumberByAnswerId(id);
    try {
      for (const bar of D.querySelectorAll(`[${ATTR_.CGXUI}="${UI_.BAR}"][data-h2o-in-title-stack]`)) {
        if (bar.hasAttribute?.(ATTR_.NO_ANSWER || 'data-at-no-answer')) continue;
        const barId = API_AT_normalizeAnswerId(
          bar.getAttribute('data-answer-id') || bar.getAttribute('data-h2o-stack-key') || ''
        );
        if (barId && DOM_resolvePrimaryAnswerId(barId) === primary) return bar;
        const barTurnNo = Math.max(0, Number(bar.getAttribute('data-h2o-stack-turn-no') || bar.getAttribute('data-h2o-turn-num') || 0) || 0);
        if (turnNo && barTurnNo === turnNo) return bar;
      }
    } catch {}
    return null;
  };

  // Bare bar skeleton — the ONE structural factory for answer title bars.
  // Used by in-flow ensure AND by the detached-bar API so a stacked bar for
  // an unhydrated turn is the exact same component, not an imitation.
  const DOM_buildBarSkeleton = () => {
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

    // NEW: collapse icon (chevron)
    const icon = D.createElement('span');
    UTIL_setAttr(icon, ATTR_.CGXUI_OWNER, SkID);
    UTIL_setAttr(icon, ATTR_.CGXUI, UI_.ICON);
    UTIL_setAttr(icon, ATTR_.CGXUI_PART, 'icon');
    icon.textContent = '⌄';
    icon.setAttribute('aria-hidden', 'true');

    bar.appendChild(badge);
    bar.appendChild(label);
    bar.appendChild(text);
    bar.appendChild(icon);
    return bar;
  };

  const DOM_ensureTitleBar = (msgEl) => {
    const S_BAR = DOM_selScoped(UI_.BAR);
    let existing = null;
    DOM_removePairedNoAnswerTitleBars(msgEl);
    // Identity wiring must NOT depend on the title pipeline. After native
    // rehydration a bar can be ensured before/without any title pass, and a
    // hydration race can leave DOM_getAnswerId(msgEl) empty on the one pass
    // that did run — producing a permanently unwired bar: no data-answer-id
    // (ledger lookups return []), no dblclick collapse toggle (visible
    // gesture dead) while the collapse ledger still holds the uuid. Ensure
    // passes repeat, so wiring here self-heals as soon as the id resolves.
    // All three wiring calls are idempotent (_collapseWired / editable-state
    // guards), so re-invoking per pass is free.
    const wireBarIdentity = (bar) => {
      if (!bar) return bar;
      try {
        const wireId = DOM_getAnswerId(msgEl);
        if (wireId) {
          UTIL_setAttr(bar, 'data-answer-id', wireId);
          DOM_enableTitleEditing(bar, wireId);
          DOM_enableCollapseToggle(bar, msgEl, wireId);
          // Washer/gold parity (§4): a rebuilt bar loses its wash paint;
          // re-project through the SAME 1A2a executor the title-list rows
          // use. Attr-presence guard keeps this a no-op on painted bars.
          try {
            if (!String(bar.getAttribute('data-h2o-title-wash') || '').trim()) {
              const wash = W.top?.H2O?.MM?.wash || W.H2O?.MM?.wash || null;
              wash?.applyToTitleBar?.(wireId, bar);
            }
          } catch {}
          // Phase 3c — collapsed-state REPLAY (MECHANISMS_RULES §4 Same
          // Collapse Authority Rule): the engine ledger is the one collapse
          // truth for BOTH individual title double-click and Page Circle
          // mass collapse. Native rehydration rebuilds the body/bar
          // expanded; if the ledger still says collapsed, re-project
          // collapsed onto THIS live pair. Done here — not via getBar
          // lookups — so a stale duplicate/stacked bar can never absorb the
          // replay meant for the visible one. Pure DOM projection: the UM
          // record/fragment stays untouched, and a later expand flows
          // through the Phase 3 hydration guard as usual.
          //
          // The skip-condition checks the LIVE pair, never a one-shot flag:
          // ensure can run before native finishes hydrating the body, and
          // hydration can also finish without ever re-triggering ensure
          // (TIME_queueProcessAnswer skips seen ids). So replay whenever the
          // ledger says collapsed but the bar token OR the body disagrees;
          // DOM_applyCollapseState is idempotent on already-folded elements.
          // The repair loop runs the same convergence check on its 5s tick
          // as the trigger-independent safety net.
          if (ENGINE_isUnmountEngineMode() && !STATE_.visitResetPending) {
            let needsReplay = false;
            try {
              const barCollapsed = String(UTIL_getAttr(bar, ATTR_.CGXUI_STATE) || '')
                .split(/\s+/).includes('collapsed');
              const bodyUnfolded = DOM_getAnswerBody(msgEl)
                .some((el) => String(el?.style?.maxHeight || '') !== '0px');
              needsReplay = !barCollapsed || bodyUnfolded;
            } catch {}
            if (needsReplay
              && ENGINE_readUnmountTitleShellCollapsed(wireId, false) === true) {
              DOM_applyCollapseState(msgEl, bar, true, false);
            }
          }
        }
      } catch {}
      return bar;
    };
    // Stack-relocated bar wins: reuse it in place (title/label/editing wiring
    // all applies to it there) and clear any duplicate created inside the
    // message element before the stack adopted the bar. This return path
    // MUST wire like every other one: a detached-origin stack row has
    // editing but no collapse toggle, and returning it bare left the visible
    // bar gesture-dead in flow after the stack released it. In stack context
    // the container's capture-phase dblclick handler suppresses the bar's
    // own listener by design, so wiring here changes nothing for list rows.
    try {
      const aId = DOM_getAnswerId(msgEl);
      const stacked = aId ? DOM_findStackedBarByAnswerId(aId) : null;
      if (stacked) {
        for (const bar of Array.from(msgEl.querySelectorAll(S_BAR))) {
          if (bar === stacked || DOM_isNoAnswerTitleBar(bar)) continue;
          try { bar.remove(); } catch {}
        }
        // A detached factory row becomes the real hydrated bar in place. Do
        // not swap the node: preserve stack identity, washer, and open state.
        try { stacked.removeAttribute('data-h2o-detached-title-bar'); } catch {}
        try { stacked.setAttribute('data-answer-id', aId); } catch {}
        const survivor = wireBarIdentity(stacked);
        DOM_removeDuplicateTitleBarsForAnswer(aId, survivor, msgEl);
        return survivor;
      }
    } catch {}
    try {
      const bars = Array.from(msgEl.querySelectorAll(S_BAR));
      const answerBars = bars.filter((bar) => !DOM_isNoAnswerTitleBar(bar));
      // Dedup survivor preference: a bar that already carries its identity
      // (wired, possibly holding user edits) beats a fresh unwired skeleton —
      // after native rehydration both can coexist briefly and keeping the
      // skeleton stranded the gesture wiring.
      existing = answerBars.find((bar) => bar.getAttribute('data-answer-id')) || answerBars[0] || null;
      for (const bar of bars) {
        if (bar === existing) continue;
        try { bar.remove(); } catch {}
      }
      if (existing && existing.parentElement !== msgEl) {
        msgEl.insertBefore(existing, msgEl.firstElementChild || null);
      }
    } catch {}
    if (existing) {
      const survivor = wireBarIdentity(existing);
      DOM_removeDuplicateTitleBarsForAnswer(DOM_getAnswerId(msgEl), survivor, msgEl);
      return survivor;
    }

    const bar = DOM_buildBarSkeleton();

    const firstChild = msgEl.firstElementChild;
    if (firstChild) msgEl.insertBefore(bar, firstChild);
    else msgEl.appendChild(bar);

    const survivor = wireBarIdentity(bar);
    DOM_removeDuplicateTitleBarsForAnswer(DOM_getAnswerId(msgEl), survivor, msgEl);
    return survivor;
  };

  const DOM_isPlaceholderTitle = (value) => {
    const text = UTIL_textTrim(value).replace(/\s+/g, ' ');
    return !text || /^(?:…|\.{2,}|untitled answer|answer(?:\s+\d+)?|\d+)$/i.test(text);
  };

  const DOM_getMeaningfulTitleFromBar = (bar) => {
    const textEl = bar?.querySelector?.(DOM_selScoped(UI_.TEXT)) || null;
    const text = UTIL_textTrim(textEl?.textContent || '');
    return DOM_isPlaceholderTitle(text) ? '' : text;
  };

  const DOM_setTitleOnAnswer = (msgEl, title) => {
    const bar = DOM_ensureTitleBar(msgEl);
    const labelEl = bar.querySelector(DOM_selScoped(UI_.LABEL));
    const turnNum = DOM_getTurnNumber(msgEl);
    if (labelEl) labelEl.textContent = turnNum > 0 ? `TITLE ${turnNum}` : 'TITLE';

    const id = DOM_getAnswerId(msgEl);
    if (id) {
      UTIL_setAttr(bar, 'data-answer-id', id);
      DOM_enableTitleEditing(bar, id);
      DOM_enableCollapseToggle(bar, msgEl, id);  // NEW
    }
    const textEl = bar.querySelector(DOM_selScoped(UI_.TEXT));
    if (textEl && title) textEl.textContent = title;

    // Reconcile newly hydrated same-turn fragments against the current live
    // collapsed state without mutating ownership or persistence.
    if (id) DOM_reconcileCollapsedDom(id);

    return bar;
  };

  const DOM_enableTitleEditing = (bar, answerId) => {
    if (!answerId) return;
    // Wired-guard by TOKEN, not exact match: a collapsed bar reads
    // "collapsed editable", so an exact-match guard fell through and the
    // unconditional overwrite below silently dropped the 'collapsed' token —
    // a bar-only expand that left msgEl data-at-collapsed="1" behind (the §4
    // forbidden split state) and re-attached the edit listeners on every
    // pass. Merge tokens instead; this writer must never remove state it
    // does not own.
    const stateTokens = String(UTIL_getAttr(bar, ATTR_.CGXUI_STATE) || '').split(/\s+/).filter(Boolean);
    if (stateTokens.includes('editable')) return;
    UTIL_setAttr(bar, ATTR_.CGXUI_STATE, stateTokens.concat('editable').join(' '));

    const span = bar.querySelector(DOM_selScoped(UI_.TEXT));
    if (!span) return;

    const clearPendingEdit = () => {
      const timer = Number(bar?._titleEditTimer || 0) || 0;
      if (!timer) return;
      try { clearTimeout(timer); } catch {}
      bar._titleEditTimer = 0;
    };

    // Delay edit-start slightly so a bar dblclick can cancel it cleanly.
    const onClick = (e) => {
      try { e.stopPropagation(); } catch {}
      clearPendingEdit();
      bar._titleEditTimer = setTimeout(() => {
        bar._titleEditTimer = 0;
        if (span.isContentEditable) return;
        DOM_startTitleEdit(span, answerId);
      }, 260);
    };

    span.addEventListener('click', onClick);
    STATE_.clean.listeners.push(() => {
      clearPendingEdit();
      span.removeEventListener('click', onClick);
    });
  };

  // ─── NEW: collapse / expand ───────────────────────────────────────────────
  const DOM_enableCollapseToggle = (bar, msgEl, answerId) => {
    if (!bar || !msgEl || !answerId) return;
    if (bar._collapseWired) return;  // idempotent
    bar._collapseWired = true;

    const clearPendingEdit = () => {
      const timer = Number(bar?._titleEditTimer || 0) || 0;
      if (!timer) return;
      try { clearTimeout(timer); } catch {}
      bar._titleEditTimer = 0;
    };

    const onBarDblClick = (e) => {
      const textEl = bar.querySelector(DOM_selScoped(UI_.TEXT));
      // Allow dblclick on the title text unless the span is already in edit mode.
      if (textEl?.isContentEditable) return;
      clearPendingEdit();
      try { e.stopPropagation(); e.preventDefault(); } catch {}
      // Resolve the LIVE pair at event time, never trust the wire-time
      // closure: native rehydration can replace the message element while
      // this bar (and this closure) survives — _collapseWired then pins a
      // detached msgEl here forever, making the legacy fallback toggle an
      // invisible no-op on a dead node and handing intent projection a
      // stale pair. The id prefers the bar's current stamp because alias
      // repair may have upgraded it after wiring; the engine router is
      // id-based either way.
      const liveId = API_AT_normalizeAnswerId(bar.getAttribute?.('data-answer-id')) || answerId;
      const liveMsgEl = (msgEl && msgEl.isConnected) ? msgEl : (API_AT_getMessageEl(liveId) || msgEl);
      const router = W.top?.H2O?.CM?.chtmech?.api || W.H2O?.CM?.chtmech?.api || null;
      const routed = router?.routeAnswerTitleDblClick?.({
        answerId: liveId,
        bar,
        msgEl: liveMsgEl,
      });
      if (routed?.handled === true) {
        const action = String(routed?.action || '');
        if (/collapse-by-id|collapse$/i.test(action)) TITLE_INTENT_recordManual(liveId, true, 'answer-title');
        else if (/expand-by-id|expand$/i.test(action)) TITLE_INTENT_recordManual(liveId, false, 'answer-title');
        TITLE_INTENT_applyProjection(liveId, liveMsgEl, bar, { animate: false });
        return;
      }
      DOM_toggleCollapse(liveMsgEl, bar, liveId);
    };

    // Use native dblclick (most reliable cross-browser)
    bar.addEventListener('dblclick', onBarDblClick);
    STATE_.clean.listeners.push(() => {
      clearPendingEdit();
      bar.removeEventListener('dblclick', onBarDblClick);
    });
  };

  const DOM_getAnswerBody = (msgEl) => {
    // Everything in msgEl except the title bar itself
    return Array.from(msgEl.children).filter(el => {
      return UTIL_getAttr(el, ATTR_.CGXUI) !== UI_.BAR;
    });
  };

  // Siblings of msgEl within its parent container: thinking-disclosure blocks,
  // quick-answer links, "Stopped thinking" banners etc. These live outside the
  // Returns ALL elements that belong to the same turn as msgEl but live OUTSIDE it.
  // Walks every ancestor level from msgEl up to (but not including) the conversation-turn
  // host and collects siblings at each level, so thinking-disclosure blocks, quick-answer
  // links, "Stopped thinking" banners etc. are always found regardless of their DOM depth.
  const DOM_getAnswerTurnSiblings = (msgEl) => {
    if (!msgEl) return [];
    const turnHost = DOM_getAnswerTurnHost(msgEl);
    if (!turnHost) return [];

    // Build the complete ancestor path from msgEl up to (not including) turnHost.
    const ancestorPath = new Set();
    let cur = msgEl;
    while (cur && cur !== turnHost) {
      ancestorPath.add(cur);
      cur = cur.parentElement;
    }

    // For each ancestor, collect its siblings that are NOT in the ancestor path and NOT
    // owned by cgxui. Covers "Stopped thinking", "Quick answer" etc. at any DOM depth.
    const result = [];
    const seen = new Set(ancestorPath);

    for (const anc of ancestorPath) {
      const parent = anc.parentElement;
      if (!parent) continue;
      for (const sibling of parent.children) {
        if (seen.has(sibling)) continue;
        seen.add(sibling);
        if (UTIL_getAttr(sibling, ATTR_.CGXUI) || UTIL_getAttr(sibling, ATTR_.CGXUI_OWNER)) continue;
        result.push(sibling);
      }
    }
    return result;
  };

  const DOM_getAnswerTurnHost = (msgEl) => {
    if (!msgEl) return null;
    return msgEl.closest?.('[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]') || msgEl.parentElement || null;
  };

  // Find the preceding user-turn host (the question for this answer).
  // Walks backwards through siblings of the assistant turn host to find
  // the closest conversation-turn that contains a user message.
  const DOM_getQuestionTurnHost = (msgEl) => {
    const turnHost = DOM_getAnswerTurnHost(msgEl);
    if (!turnHost) return null;
    let prev = turnHost.previousElementSibling;
    while (prev) {
      // Skip dividers and other non-turn elements
      const role = String(prev.getAttribute?.('data-message-author-role') || '').toLowerCase();
      const hasUser = !!prev.querySelector?.('[data-message-author-role="user"]');
      const hasAssistant = !!prev.querySelector?.('[data-message-author-role="assistant"]');
      if ((role === 'user' || hasUser) && !hasAssistant) return prev;
      if (hasUser || role === 'user') return prev;
      // If this is another assistant turn stop — don't cross another Q/A pair
      if (role === 'assistant' || hasAssistant) break;
      prev = prev.previousElementSibling;
    }
    return null;
  };

  const DOM_getAnswerToolbars = (msgEl) => {
    const turnHost = DOM_getAnswerTurnHost(msgEl);
    if (!turnHost?.querySelectorAll) return [];
    const selectors = [
      '[aria-label="Response actions"]',
      '[data-testid="response-actions"]',
    ];
    const out = [];
    const seen = new Set();
    for (const sel of selectors) {
      let nodes = [];
      try { nodes = Array.from(turnHost.querySelectorAll(sel)); } catch {}
      for (const el of nodes) {
        if (!el || seen.has(el)) continue;
        seen.add(el);
        out.push(el);
      }
    }
    return out;
  };

  const DOM_hasCollapsedDomResidue = (msgEl = null, bar = null) => {
    if (!msgEl) return false;
    const liveBar = bar || null;

    if (UTIL_getAttr(msgEl, ATTR_.COLLAPSED) === '1') return true;

    const barState = String(UTIL_getAttr(liveBar, ATTR_.CGXUI_STATE) || '').trim();
    if (barState.split(/\s+/).includes('collapsed')) return true;

    const managedEls = DOM_getAnswerBody(msgEl)
      .concat(DOM_getAnswerTurnSiblings(msgEl))
      .concat(DOM_getAnswerToolbars(msgEl));
    if (managedEls.some((el) => UTIL_getAttr(el, 'data-cgxui-at-hidden') === '1')) return true;

    const questionHost = DOM_getQuestionTurnHost(msgEl);
    if (UTIL_getAttr(questionHost, 'data-at-question-hidden') === '1') return true;

    return false;
  };

  const DOM_isAnswerCurrentlyCollapsed = (answerId, msgEl = null, bar = null) => {
    const id = API_AT_normalizeAnswerId(answerId || DOM_getAnswerId(msgEl));
    if (!id) return false;

    const liveMsgEl = msgEl || API_AT_getMessageEl(id);
    if (!liveMsgEl) return false;
    const liveBar = bar || API_AT_getBar(id);

    // In engine mode, Unmount adapter is the sole collapse authority whenever it can answer.
    // DOM residue must not override an engine-reported expand state.
    if (ENGINE_isUnmountEngineMode()) {
      const engineCollapsed = ENGINE_readUnmountTitleShellCollapsed(id, null);
      if (engineCollapsed !== null) return !!engineCollapsed;
    }

    if (STATE_.collapsed.has(id)) return true;
    return DOM_hasCollapsedDomResidue(liveMsgEl, liveBar);
  };

  function DOM_reconcileCollapsedDom(answerId) {
    const id = API_AT_normalizeAnswerId(answerId);
    if (!id) return false;

    const msgEl = API_AT_getMessageEl(id);
    const bar = API_AT_getBar(id);
    if (!msgEl || !bar) return false;

    if (ENGINE_isUnmountEngineMode()) {
      const engineCollapsed = ENGINE_readUnmountTitleShellCollapsed(id, null);
      if (engineCollapsed === true) {
        DOM_applyCollapseState(msgEl, bar, true, false);
        return true;
      }
      if (engineCollapsed === false && DOM_hasCollapsedDomResidue(msgEl, bar)) {
        DOM_applyCollapseState(msgEl, bar, false, false);
        return true;
      }
    }

    if (!DOM_isAnswerCurrentlyCollapsed(id, msgEl, bar)) return false;

    DOM_applyCollapseState(msgEl, bar, true, false);
    return true;
  }

  const DOM_findCollapsedAnswerIdForMutationTarget = (node) => {
    const workEl = node instanceof HTMLElement ? node : node?.parentElement || null;
    if (!workEl) return '';
    if (UTIL_getAttr(workEl, ATTR_.CGXUI) || UTIL_getAttr(workEl, ATTR_.CGXUI_OWNER)) return '';
    if (workEl.closest?.(SEL_.OWNED_BAR_ANY)) return '';

    const turnHost = workEl.closest?.(SEL_.TURN);
    if (!turnHost) return '';

    let msgEl = null;
    try { msgEl = turnHost.querySelector?.(SEL_.ASSISTANT_MSG) || null; } catch {}
    if (!msgEl) return '';

    const answerId = DOM_getAnswerId(msgEl);
    if (!answerId) return '';
    return DOM_isAnswerCurrentlyCollapsed(answerId, msgEl, API_AT_getBar(answerId)) ? answerId : '';
  };

  const DOM_applyCollapseState = (msgEl, bar, collapsed, animate = true) => {
    const bodyEls = DOM_getAnswerBody(msgEl);
    const siblingEls = DOM_getAnswerTurnSiblings(msgEl);
    const toolbarEls = DOM_getAnswerToolbars(msgEl).filter(el => !bodyEls.includes(el) && !siblingEls.includes(el));
    const managedEls = bodyEls.concat(siblingEls).concat(toolbarEls);
    const iconEl  = bar ? bar.querySelector(DOM_selScoped(UI_.ICON)) : null;

    // Also hide/show the preceding user-turn host (the question for this answer)
    const questionHost = DOM_getQuestionTurnHost(msgEl);

    if (collapsed) {
      UTIL_setAttr(bar, ATTR_.CGXUI_STATE, 'collapsed editable');
      UTIL_setAttr(msgEl, ATTR_.COLLAPSED, '1');
      if (iconEl) iconEl.textContent = '›';
      managedEls.forEach(el => {
        if (animate) {
          el.style.transition = `opacity ${CFG_.COLLAPSE_TRANSITION_MS}ms ease, max-height ${CFG_.COLLAPSE_TRANSITION_MS}ms ease, height ${CFG_.COLLAPSE_TRANSITION_MS}ms ease`;
        }
        el.style.overflow = 'hidden';
        el.style.maxHeight = '0px';
        el.style.height = '0px';
        el.style.minHeight = '0px';
        el.style.marginTop = '0px';
        el.style.marginBottom = '0px';
        el.style.paddingTop = '0px';
        el.style.paddingBottom = '0px';
        el.style.borderTopWidth = '0px';
        el.style.borderBottomWidth = '0px';
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        try { el.setAttribute('data-cgxui-at-hidden', '1'); } catch {}
      });
      // Hide the question turn (the user message before this answer)
      if (questionHost) {
        UTIL_setAttr(questionHost, 'data-at-question-hidden', '1');
        if (animate) questionHost.style.transition = `opacity ${CFG_.COLLAPSE_TRANSITION_MS}ms ease`;
        questionHost.style.overflow = 'hidden';
        questionHost.style.maxHeight = '0px';
        questionHost.style.height = '0px';
        questionHost.style.minHeight = '0px';
        questionHost.style.marginTop = '0px';
        questionHost.style.marginBottom = '0px';
        questionHost.style.paddingTop = '0px';
        questionHost.style.paddingBottom = '0px';
        questionHost.style.opacity = '0';
        questionHost.style.pointerEvents = 'none';
      }
    } else {
      UTIL_setAttr(bar, ATTR_.CGXUI_STATE, 'editable');
      UTIL_delAttr(msgEl, ATTR_.COLLAPSED);
      if (iconEl) iconEl.textContent = '⌄';
      managedEls.forEach(el => {
        if (animate) {
          el.style.transition = `opacity ${CFG_.COLLAPSE_TRANSITION_MS}ms ease, max-height ${CFG_.COLLAPSE_TRANSITION_MS}ms ease, height ${CFG_.COLLAPSE_TRANSITION_MS}ms ease`;
        }
        el.style.overflow = '';
        el.style.maxHeight = '';
        el.style.height = '';
        el.style.minHeight = '';
        el.style.marginTop = '';
        el.style.marginBottom = '';
        el.style.paddingTop = '';
        el.style.paddingBottom = '';
        el.style.borderTopWidth = '';
        el.style.borderBottomWidth = '';
        el.style.opacity = '';
        el.style.pointerEvents = '';
        try { el.removeAttribute('data-cgxui-at-hidden'); } catch {}
        try { el.style.removeProperty('display'); } catch { el.style.display = ''; }
        if (animate) {
          setTimeout(() => { el.style.transition = ''; }, CFG_.COLLAPSE_TRANSITION_MS + 50);
        }
      });
      // Restore the question turn
      if (questionHost) {
        UTIL_delAttr(questionHost, 'data-at-question-hidden');
        // Also clear Core's display:none path (set by setQuestionHostTitleListHidden)
        UTIL_delAttr(questionHost, 'data-cgxui-chat-page-question-hidden');
        if (animate) questionHost.style.transition = `opacity ${CFG_.COLLAPSE_TRANSITION_MS}ms ease`;
        questionHost.style.overflow = '';
        questionHost.style.maxHeight = '';
        questionHost.style.height = '';
        questionHost.style.minHeight = '';
        questionHost.style.marginTop = '';
        questionHost.style.marginBottom = '';
        questionHost.style.paddingTop = '';
        questionHost.style.paddingBottom = '';
        questionHost.style.opacity = '';
        questionHost.style.pointerEvents = '';
        questionHost.style.removeProperty('display'); // clears Core's !important display:none
        if (animate) {
          setTimeout(() => { questionHost.style.transition = ''; }, CFG_.COLLAPSE_TRANSITION_MS + 50);
        }
      }
    }
  };

  const DOM_toggleCollapse = (msgEl, bar, answerId) => {
    const isNowCollapsed = UTIL_getAttr(msgEl, ATTR_.COLLAPSED) === '1';
    const nextCollapsed  = !isNowCollapsed;

    DOM_applyCollapseState(msgEl, bar, nextCollapsed, true);

    // Persist collapse state
    if (nextCollapsed) STATE_.collapsed.add(answerId);
    else STATE_.collapsed.delete(answerId);
    ENGINE_saveCollapsed();

    // Notify other modules (e.g. MiniMap may want to reposition panels)
    UTIL_dispatch(EV_.ANSWER_COLLAPSE, { answerId, collapsed: nextCollapsed });

    DIAG_step('collapse:toggle', { answerId, collapsed: nextCollapsed });
  };

  // ─── UPDATED: MiniMap DOM sync uses the correct 1A5a selector ─────────────
  const DOM_tryUpdateMiniMap = (answerId, title) => {
    try {
      // Primary: use the exact selector from 1A5a (data-cgxui="mnmp-btn" + data-cgxui-owner="mnmp")
      // data-primary-a-id first, then data-id fallback
      const primarySel = `[data-cgxui="mnmp-btn"][data-cgxui-owner="mnmp"][data-primary-a-id="${CSS.escape(String(answerId))}"]`;
      const idSel      = `[data-cgxui="mnmp-btn"][data-cgxui-owner="mnmp"][data-id="${CSS.escape(String(answerId))}"]`;

      let btn = D.querySelector(primarySel) || D.querySelector(idSel);

      if (btn) {
        btn.setAttribute('title', title || '');
        return true;
      }

      // Secondary: legacy selectors for older MiniMap versions
      const legacyCandidates = [
        '.ho-mm-btn',
        '[data-ho-mm-btn]',
        '[data-cgxui="mm-btn"]',
        '[data-cgxui="minimap-btn"]',
      ];
      for (const sel of legacyCandidates) {
        const nodes = D.querySelectorAll(sel);
        for (const n of nodes) {
          const did =
            n.dataset?.primaryAId ||
            n.dataset?.id ||
            UTIL_getAttr(n, 'data-id') ||
            UTIL_getAttr(n, ATTR_.MSG_ID);

          if (did === answerId) {
            n.setAttribute('title', title || '');
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
    const S_ICON  = selScoped(UI_.ICON);

    const HOST_RTL = `.cgxui-${SkID}-rtl-answer`;

    // Collapsed state selector
    const S_BAR_COLLAPSED = `${S_BAR}[${ATTR_.CGXUI_STATE}~="collapsed"]`;

    return `
/* ── Answer Title Bar ── */
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

  /* NEW: smooth hover + cursor cue */
  cursor: default;
  transition: background 0.15s ease, border-color 0.15s ease;
}

${S_BAR}:hover{
  background: linear-gradient(90deg, rgba(255,255,255,0.13), rgba(255,255,255,0.06)) !important;
  border-color: rgba(255,255,255,0.14) !important;
}

/* NEW: Collapsed state — bar shows as a thin accent strip */
${S_BAR_COLLAPSED}{
  opacity: 0.75;
  border-style: dashed;
}

[${ATTR_.ROLE}="assistant"][${ATTR_.COLLAPSED}="1"] > ${S_BAR}{
  --h2o-at-collapsed-text-resolved: var(--h2o-at-wash-text, inherit);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--h2o-at-wash-color, rgba(255,255,255,0.14)) 26%, rgba(255,255,255,0.10)),
    color-mix(in srgb, var(--h2o-at-wash-color, rgba(255,255,255,0.06)) 12%, rgba(255,255,255,0.03))
  ) !important;
  border-color: color-mix(in srgb, var(--h2o-at-wash-color, rgba(255,255,255,0.18)) 34%, rgba(255,255,255,0.12)) !important;
  box-shadow: 0 0 10px color-mix(in srgb, var(--h2o-at-wash-glow, transparent) 16%, transparent);
}

html[data-cgxui-at-collapsed-text-mode="consistent"] [${ATTR_.ROLE}="assistant"][${ATTR_.COLLAPSED}="1"] > ${S_BAR}{
  --h2o-at-collapsed-text-resolved: var(--h2o-at-collapsed-consistent-text, rgba(242, 246, 255, 0.95));
}

[${ATTR_.ROLE}="assistant"][${ATTR_.COLLAPSED}="1"] > ${S_BAR} ${S_TEXT}{
  color: var(--h2o-at-collapsed-text-resolved, inherit) !important;
}

[${ATTR_.ROLE}="assistant"][${ATTR_.COLLAPSED}="1"] > ${S_BAR} ${S_LABEL},
[${ATTR_.ROLE}="assistant"][${ATTR_.COLLAPSED}="1"] > ${S_BAR} ${S_ICON}{
  color: color-mix(in srgb, var(--h2o-at-collapsed-text-resolved, currentColor) 72%, transparent) !important;
}

${S_LABEL}{
  text-transform: uppercase;
  font-size: 0.68rem;
  opacity: 0.7;
  letter-spacing: 0.06em;
  user-select: none;
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
  flex-shrink: 0;
}

[${ATTR_.ROLE}="assistant"][${ATTR_.COLLAPSED}="1"] > ${S_BAR} ${S_BADGE}{
  background: #facc15 !important;
  box-shadow: 0 0 6px rgba(250, 204, 21, 0.8) !important;
}

/* NEW: Collapse chevron icon */
${S_ICON}{
  font-size: 0.78rem;
  opacity: 0.55;
  margin-left: 2px;
  user-select: none;
  cursor: pointer;
  transition: transform 0.18s ease, opacity 0.15s ease;
  flex-shrink: 0;
  /* Point down when expanded */
  display: inline-block;
  transform: rotate(0deg);
}

${S_BAR}:hover ${S_ICON}{
  opacity: 0.9;
}

/* Collapsed: icon rotated to point right */
${S_BAR_COLLAPSED} ${S_ICON}{
  transform: rotate(-90deg);
  opacity: 0.75;
}

/* RTL host */
${HOST_RTL}{
  direction: rtl !important;
  text-align: right !important;
}

/* Keep the title bar readable even inside RTL answers */
${HOST_RTL} > ${S_BAR}{
  direction: ltr !important;
  text-align: left !important;
}

/* ── DOUBLE-CLICK HINT: visual feedback while pressing ── */
${S_BAR}:active{
  opacity: 0.7;
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
          if (m.type === 'characterData') {
            const relatedAnswerId = DOM_findCollapsedAnswerIdForMutationTarget(m.target);
            if (relatedAnswerId) DOM_reconcileCollapsedDom(relatedAnswerId);
            continue;
          }
          if (!m.addedNodes || !m.addedNodes.length) continue;
          m.addedNodes.forEach(node => {
            if (node instanceof HTMLElement) {
              if (node.matches?.(SEL_.ASSISTANT_MSG)) {
                TIME_queueProcessAnswer(node, 0);
              }
              const inner = node.querySelectorAll?.(SEL_.ASSISTANT_MSG);
              if (inner && inner.length) {
                inner.forEach(el => TIME_queueProcessAnswer(el, 0));
              }
            }
            const relatedAnswerId = DOM_findCollapsedAnswerIdForMutationTarget(node);
            if (relatedAnswerId) DOM_reconcileCollapsedDom(relatedAnswerId);
          });
        }
      } catch (e) { DIAG_err('mo:cb', e); }
    });

    mo.observe(root, { childList: true, subtree: true, characterData: true });
    STATE_.clean.mo = mo;
  };

  const TIME_startRepairLoop = () => {
    const intId = setInterval(() => {
      try {
        // Phase 3c — steady-state collapse convergence (§4 Same Collapse
        // Authority Rule). Every event-driven replay can fire before native
        // rehydration is complete: the assistant node may not carry
        // data-message-id yet when the added-node mapper runs, the body can
        // hydrate after the last childList mutation, and processed ids are
        // never re-queued — leaving a ledger-collapsed answer visibly
        // expanded with no remaining trigger. This tick re-projects
        // collapsed onto the LIVE bar+msgEl pair (closest-based — no getBar
        // indirection a stale duplicate could absorb) until the DOM agrees
        // with the ledger. Fold-only projection: expand stays with the
        // router, manualCollapsedIds is read, never written.
        const engineMode = ENGINE_isUnmountEngineMode();
        let engineCollapsedSet = null;
        const LEDGER_readCollapsedSet = () => {
          if (engineCollapsedSet) return engineCollapsedSet;
          engineCollapsedSet = new Set();
          try {
            const api = ENGINE_getUnmountApi();
            for (const source of ['answer-title', 'title-list-row']) {
              const ids = api?.getManualCollapsedIds?.({ source });
              if (!Array.isArray(ids)) continue;
              for (const cid of ids) {
                const norm = API_AT_normalizeAnswerId(cid);
                if (norm) engineCollapsedSet.add(norm);
              }
            }
          } catch {}
          return engineCollapsedSet;
        };
        const textEls = D.querySelectorAll(SEL_.OWNED_TEXT_ANY);
        textEls.forEach((textEl) => {
          const bar = textEl.closest(SEL_.OWNED_BAR_ANY);
          const msgEl = textEl.closest(SEL_.ASSISTANT_MSG);
          if (!bar || !msgEl) return;

          const id = DOM_getAnswerId(msgEl);
          if (!id) return;

          // The ensure owner elects one live/stacked survivor and removes
          // hydration/restoration remnants before this cadence wires or
          // replays anything. Never legitimize both sides of a duplicate.
          const canonicalBar = DOM_ensureTitleBar(msgEl);
          if (!canonicalBar || canonicalBar !== bar) return;

          // Self-heal gesture identity (§4): a bar that survived — or was
          // rebuilt around — native re-rendering may have missed every
          // ensure pass (processed ids are never re-queued), leaving a
          // visible bar with no data-answer-id, no collapse toggle, and no
          // wash. All three repairs are idempotent (_collapseWired /
          // editable-token / attr-presence guards), so re-invoking per tick
          // is free. Washer re-projection goes through the SAME 1A2a
          // executor the title-list rows use — one washer system.
          try {
            if (!bar.getAttribute('data-answer-id')) UTIL_setAttr(bar, 'data-answer-id', id);
            DOM_enableTitleEditing(bar, id);
            DOM_enableCollapseToggle(bar, msgEl, id);
            if (!String(bar.getAttribute('data-h2o-title-wash') || '').trim()) {
              const wash = W.top?.H2O?.MM?.wash || W.H2O?.MM?.wash || null;
              wash?.applyToTitleBar?.(id, bar);
            }
          } catch {}

          if (engineMode && !STATE_.visitResetPending && LEDGER_readCollapsedSet().has(id)) {
            const barCollapsed = String(UTIL_getAttr(bar, ATTR_.CGXUI_STATE) || '')
              .split(/\s+/).includes('collapsed');
            const bodyUnfolded = DOM_getAnswerBody(msgEl)
              .some((el) => String(el?.style?.maxHeight || '') !== '0px');
            if (!barCollapsed || bodyUnfolded) DOM_applyCollapseState(msgEl, bar, true, false);
          }

          const fullTextNow = DOM_getAnswerText(msgEl);
          ENGINE_applyRtlIfArabic(msgEl, fullTextNow);

          // Numbers are stamped once from authoritative turn identity; repair
          // stale stamps (from early hydration, when the runtime could not
          // answer yet) instead of trusting whatever was written before.
          try {
            const canonicalNum = DOM_getTurnNumber(msgEl);
            if (canonicalNum > 0) {
              const numStr = String(canonicalNum);
              const labelEl = bar.querySelector(DOM_selScoped(UI_.LABEL));
              const expectedLabel = `TITLE ${numStr}`;
              if (labelEl && labelEl.textContent !== expectedLabel) labelEl.textContent = expectedLabel;
              if (UTIL_getAttr(bar, 'data-h2o-turn-num') !== numStr) UTIL_setAttr(bar, 'data-h2o-turn-num', numStr);
            }
            // Stale builds wrote the number into the badge element itself —
            // clear any leftover text so the badge stays a pure dot.
            const badgeEl = bar.querySelector(DOM_selScoped(UI_.BADGE));
            if (badgeEl && badgeEl.textContent) badgeEl.textContent = '';
          } catch {}

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



function API_AT_normalizeAnswerId(answerId) {
  return UTIL_textTrim(answerId);
}

function API_AT_getMessageEl(answerId) {
  const id = API_AT_normalizeAnswerId(answerId);
  if (!id) return null;
  const direct = D.querySelector(`[${ATTR_.ROLE}="assistant"][${ATTR_.MSG_ID}="${CSS.escape(id)}"]`);
  if (direct) return direct;
  const legacy = D.querySelector(`[${ATTR_.ROLE}="assistant"][${ATTR_.HO_ID}="${CSS.escape(id)}"]`);
  if (legacy) return legacy;
  const list = DOM_getAssistantMessages();
  for (const msgEl of list) {
    if (DOM_getAnswerId(msgEl) === id) return msgEl;
  }
  return null;
}

function API_AT_getBar(answerId) {
  const msgEl = API_AT_getMessageEl(answerId);
  if (!msgEl) return null;
  try { return msgEl.querySelector(DOM_selScoped(UI_.BAR)); } catch { return null; }
}

function API_AT_ensureBar(answerId) {
  const id = API_AT_normalizeAnswerId(answerId);
  if (!id) return { ok: false, status: 'invalid-id', answerId: id, bar: null };
  const msgEl = API_AT_getMessageEl(id);
  if (!msgEl) return { ok: false, status: 'answer-missing', answerId: id, bar: null };
  const bar = DOM_ensureTitleBar(msgEl);
  return { ok: !!bar, status: bar ? 'ok' : 'bar-missing', answerId: id, bar: bar || null };
}

function API_AT_getTitle(answerId) {
  const id = API_AT_normalizeAnswerId(answerId);
  return id ? String(STATE_.titles[id] || '') : '';
}

function API_AT_getTitles() {
  return Object.assign({}, STATE_.titles || {});
}

function API_AT_isCollapsed(answerId) {
  const id = API_AT_normalizeAnswerId(answerId);
  if (!id) return false;
  if (ENGINE_isUnmountEngineMode()) {
    const engineCollapsed = ENGINE_readUnmountTitleShellCollapsed(id, null);
    if (engineCollapsed !== null) return !!engineCollapsed;
  }
  const msgEl = API_AT_getMessageEl(id);
  const bar = API_AT_getBar(id);
  return DOM_isAnswerCurrentlyCollapsed(id, msgEl, bar);
}

function API_AT_getCollapsedIds() {
  return Array.from(STATE_.collapsed || []);
}

function API_AT_setCollapsed(answerId, collapsed, opts = {}) {
  const id = API_AT_normalizeAnswerId(answerId);
  if (!id) return { ok: false, status: 'invalid-id', answerId: id, collapsed: !!collapsed };
  const msgEl = API_AT_getMessageEl(id);
  if (!msgEl) return { ok: false, status: 'answer-missing', answerId: id, collapsed: !!collapsed };
  const ensured = API_AT_ensureBar(id);
  const bar = ensured.bar || null;
  if (!bar) return { ok: false, status: 'bar-missing', answerId: id, collapsed: !!collapsed };
  const nextCollapsed = !!collapsed;
  const currentCollapsed = API_AT_isCollapsed(id);
  if (currentCollapsed === nextCollapsed) {
    return { ok: true, status: 'ok', answerId: id, collapsed: nextCollapsed };
  }
  DOM_applyCollapseState(msgEl, bar, nextCollapsed, opts?.animate !== false);
  if (nextCollapsed) STATE_.collapsed.add(id);
  else STATE_.collapsed.delete(id);
  ENGINE_saveCollapsed();
  UTIL_dispatch(EV_.ANSWER_COLLAPSE, { answerId: id, collapsed: nextCollapsed });
  DIAG_step('collapse:set', { answerId: id, collapsed: nextCollapsed, source: String(opts?.source || 'api') });
  return { ok: true, status: 'ok', answerId: id, collapsed: nextCollapsed };
}

function API_AT_toggleCollapsed(answerId, opts = {}) {
  const id = API_AT_normalizeAnswerId(answerId);
  if (!id) return { ok: false, status: 'invalid-id', answerId: id, collapsed: false };
  return API_AT_setCollapsed(id, !API_AT_isCollapsed(id), opts);
}

function API_AT_resetCollapsedForCurrentChat(opts = {}) {
  const answerEls = DOM_getAssistantMessages();
  const ids = new Set();
  let changed = 0;
  const explicitIds = Array.isArray(opts?.answerIds) ? opts.answerIds : [];

  for (const msgEl of answerEls) {
    const id = API_AT_normalizeAnswerId(DOM_getAnswerId(msgEl));
    if (id) ids.add(id);
  }
  for (const raw of explicitIds) {
    const id = API_AT_normalizeAnswerId(raw);
    if (id) ids.add(id);
  }

  for (const id of ids) {
    API_AT_setCollapsed(id, false, { animate: opts?.animate === true, source: 'reset-current-chat' });
    if (id && STATE_.collapsed.delete(id)) changed += 1;
  }

  // Best-effort residue cleanup for currently mounted nodes.
  for (const msgEl of answerEls) {
    UTIL_delAttr(msgEl, ATTR_.COLLAPSED);
    const managed = DOM_getAnswerBody(msgEl)
      .concat(DOM_getAnswerTurnSiblings(msgEl))
      .concat(DOM_getAnswerToolbars(msgEl));
    managed.forEach((el) => {
      try { el.removeAttribute('data-cgxui-at-hidden'); } catch {}
      try { el.style.removeProperty('display'); } catch {}
    });
    const qHost = DOM_getQuestionTurnHost(msgEl);
    if (qHost) {
      UTIL_delAttr(qHost, 'data-at-question-hidden');
      UTIL_delAttr(qHost, 'data-cgxui-chat-page-question-hidden');
      try { qHost.style.removeProperty('display'); } catch {}
    }
  }

  ENGINE_saveCollapsed();
  return {
    ok: true,
    status: 'ok',
    answers: ids.size,
    changed,
  };
}

function API_AT_setTitle(answerId, title, opts = {}) {
  const id = API_AT_normalizeAnswerId(answerId);
  if (!id) return { ok: false, status: 'invalid-id', answerId: id, title: '' };
  const clean = UTIL_textTrim(title);
  if (!clean) delete STATE_.titles[id];
  else STATE_.titles[id] = clean;
  ENGINE_saveTitles(STATE_.titles);
  const msgEl = API_AT_getMessageEl(id);
  if (msgEl) {
    const full = DOM_getAnswerText(msgEl);
    ENGINE_applyRtlIfArabic(msgEl, full);
    DOM_setTitleOnAnswer(msgEl, clean || ENGINE_generateLocalTitle(full));
  }
  DOM_tryUpdateMiniMap(id, clean || STATE_.titles[id] || '');
  UTIL_dispatch(EV_.TITLE_SET, { answerId: id, title: clean || '' });
  return { ok: true, status: msgEl ? 'ok' : 'answer-missing', answerId: id, title: clean || '' };
}

function API_AT_sync(answerId, opts = {}) {
  const id = API_AT_normalizeAnswerId(answerId);
  if (!id) return { ok: false, status: 'invalid-id', answerId: id, titleApplied: false, collapseApplied: false };
  const msgEl = API_AT_getMessageEl(id);
  if (!msgEl) return { ok: false, status: 'answer-missing', answerId: id, titleApplied: false, collapseApplied: false };
  const ensured = API_AT_ensureBar(id);
  const bar = ensured.bar || null;
  let titleApplied = false;
  let collapseApplied = false;
  const title = String(STATE_.titles[id] || '').trim();
  if (title) {
    DOM_setTitleOnAnswer(msgEl, title);
    DOM_tryUpdateMiniMap(id, title);
    titleApplied = true;
  }
  if (bar) {
    const shouldBeCollapsed = ENGINE_isUnmountEngineMode()
      ? !!ENGINE_readUnmountTitleShellCollapsed(id, false)
      : STATE_.collapsed.has(id);
    if (shouldBeCollapsed) {
      DOM_applyCollapseState(msgEl, bar, true, opts?.animate === true);
      collapseApplied = true;
    } else if (ENGINE_isUnmountEngineMode() && DOM_hasCollapsedDomResidue(msgEl, bar)) {
      DOM_applyCollapseState(msgEl, bar, false, false);
      collapseApplied = true;
    }
  }
  return { ok: true, status: 'ok', answerId: id, titleApplied, collapseApplied };
}

function API_AT_getConfig() {
  return UI_AT_readCfg();
}

function API_AT_applySetting(key, value) {
  const current = UI_AT_readCfg();
  const next = UI_AT_writeCfg({ ...current, [String(key || '')]: value });
  UI_AT_applyCfg();
  return next;
}

MOD_OBJ.api = MOD_OBJ.api || Object.create(null);
MOD_OBJ.api.getConfig = API_AT_getConfig;
MOD_OBJ.api.applySetting = API_AT_applySetting;
MOD_OBJ.api.public = Object.freeze({
  ver: '1.0.0',
  getTitle: API_AT_getTitle,
  setTitle: API_AT_setTitle,
  getTitles: API_AT_getTitles,
  isCollapsed: API_AT_isCollapsed,
  getCollapsedIds: API_AT_getCollapsedIds,
  setCollapsed: API_AT_setCollapsed,
  toggleCollapsed: API_AT_toggleCollapsed,
  resetCollapsedForCurrentChat: API_AT_resetCollapsedForCurrentChat,
  getMessageEl: API_AT_getMessageEl,
  getBar: API_AT_getBar,
  ensureBar: API_AT_ensureBar,
  sync: API_AT_sync,
  getConfig: API_AT_getConfig,
  applySetting: API_AT_applySetting,
});
  /* ───────────────────────────── ⚫️ LIFECYCLE — INIT / WIRING / STARTUP 📝🔓💥 ───────────────────────────── */

  function CORE_AT_boot() {
    if (STATE_.booted) {
      UI_ensureStyle();
      STATE_.titles = ENGINE_loadTitles();
      DIAG_step('boot:noop', { already: true });
      return;
    }
    STATE_.booted = true;

    DIAG_step('boot:start', { ver: '2.1.0', pid: PID });

    UI_ensureStyle();
    UI_AT_applyCfg();

    ENGINE_migrateTitlesOnce();
    STATE_.titles = ENGINE_loadTitles();
    STATE_.collapsed = ENGINE_loadCollapsed();  // NEW

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

        const msgEl =
          D.querySelector(`[${ATTR_.ROLE}="assistant"][${ATTR_.MSG_ID}="${answerId}"]`) ||
          D.querySelector(`[${ATTR_.ROLE}="assistant"][${ATTR_.HO_ID}="${answerId}"]`);
        if (msgEl) {
          const full = DOM_getAnswerText(msgEl);
          ENGINE_applyRtlIfArabic(msgEl, full);
          const titleNow = clean || ENGINE_generateLocalTitle(full);
          DOM_setTitleOnAnswer(msgEl, titleNow);
        }

        DOM_tryUpdateMiniMap(answerId, clean || STATE_.titles[answerId] || '');
      } catch (err) { DIAG_err('ev:title:handler', err); }
    };

    const onAnswerCollapse = (e) => {
      try {
        if (!ENGINE_isUnmountEngineMode()) return;
        const d = e && e.detail ? e.detail : {};
        const answerId = API_AT_normalizeAnswerId(d.answerId);
        if (!answerId) return;
        const msgEl = API_AT_getMessageEl(answerId);
        if (!msgEl) return;
        const ensured = API_AT_ensureBar(answerId);
        const bar = ensured?.bar || API_AT_getBar(answerId);
        if (!bar) return;
        const collapsed = !!d.collapsed;
        if (collapsed) STATE_.collapsed.add(answerId);
        else STATE_.collapsed.delete(answerId);
        DOM_applyCollapseState(msgEl, bar, collapsed, false);
      } catch (err) { DIAG_err('ev:collapse:handler', err); }
    };

    W.addEventListener(EV_.TITLE_SET_LEG, onTitle);
    W.addEventListener(EV_.TITLE_SET, onTitle);
    W.addEventListener(EV_.ANSWER_COLLAPSE, onAnswerCollapse);
    STATE_.clean.listeners.push(() => W.removeEventListener(EV_.TITLE_SET_LEG, onTitle));
    STATE_.clean.listeners.push(() => W.removeEventListener(EV_.TITLE_SET, onTitle));
    STATE_.clean.listeners.push(() => W.removeEventListener(EV_.ANSWER_COLLAPSE, onAnswerCollapse));

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

    try { STATE_.clean.mo?.disconnect?.(); } catch {}
    STATE_.clean.mo = null;

    try { if (STATE_.clean.repairInt) clearInterval(STATE_.clean.repairInt); } catch {}
    STATE_.clean.repairInt = null;

    try {
      for (const t of STATE_.pendingTimers.values()) { try { clearTimeout(t); } catch {} }
      STATE_.pendingTimers.clear();
    } catch {}

    try {
      const bars = D.querySelectorAll(SEL_.OWNED_BAR_ANY);
      bars.forEach(n => { try { n.remove(); } catch {} });
    } catch {}

    // NEW: restore collapsed body elements before removing bar (clean DOM)
    try {
      D.querySelectorAll(`[${ATTR_.COLLAPSED}="1"]`).forEach(msgEl => {
        const elsToRestore = DOM_getAnswerBody(msgEl).concat(DOM_getAnswerTurnSiblings(msgEl));
        elsToRestore.forEach(el => {
          el.style.overflow = '';
          el.style.maxHeight = '';
          el.style.height = '';
          el.style.minHeight = '';
          el.style.marginTop = '';
          el.style.marginBottom = '';
          el.style.paddingTop = '';
          el.style.paddingBottom = '';
          el.style.borderTopWidth = '';
          el.style.borderBottomWidth = '';
          el.style.opacity = '';
          el.style.pointerEvents = '';
          el.style.transition = '';
        });
        UTIL_delAttr(msgEl, ATTR_.COLLAPSED);
        // Also restore any hidden question turn host
        const qHost = DOM_getQuestionTurnHost(msgEl);
        if (qHost && UTIL_getAttr(qHost, 'data-at-question-hidden') === '1') {
          UTIL_delAttr(qHost, 'data-at-question-hidden');
          qHost.style.overflow = '';
          qHost.style.maxHeight = '';
          qHost.style.height = '';
          qHost.style.minHeight = '';
          qHost.style.marginTop = '';
          qHost.style.marginBottom = '';
          qHost.style.paddingTop = '';
          qHost.style.paddingBottom = '';
          qHost.style.opacity = '';
          qHost.style.pointerEvents = '';
          qHost.style.transition = '';
        }
      });
    } catch {}

    try { STATE_.clean.styleEl?.remove?.(); } catch {}
    STATE_.clean.styleEl = null;

    try { (STATE_.clean.listeners || []).forEach(fn => { try { fn(); } catch {} }); } catch {}
    STATE_.clean.listeners = [];

    try {
      STATE_.mutatedMsgs.forEach((msgEl) => {
        try { msgEl.classList.remove(`cgxui-${SkID}-rtl-answer`); } catch {}
        try { UTIL_delAttr(msgEl, ATTR_.DIR); } catch {}
      });
      STATE_.mutatedMsgs.clear();
    } catch {}

    DIAG_step('dispose:done', { ok: true });
  }

  // Engine function (depends on TIME helpers — placed after TIME section)
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

      if (!newTitle) {
        delete STATE_.titles[answerId];
        ENGINE_saveTitles(STATE_.titles);
        UTIL_dispatch(EV_.TITLE_SET_LEG, { answerId, title: '' });
        UTIL_dispatch(EV_.TITLE_SET,     { answerId, title: '' });
        return;
      }

      STATE_.titles[answerId] = newTitle;
      ENGINE_saveTitles(STATE_.titles);

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

  async function ENGINE_processAnswer(msgEl, attempt = 0) {
    const id = DOM_getAnswerId(msgEl);
    if (!id) return;

    const text = DOM_getAnswerText(msgEl);

    ENGINE_applyRtlIfArabic(msgEl, text);

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

    STATE_.titles[id] = finalTitle;
    ENGINE_saveTitles(STATE_.titles);

    DOM_tryUpdateMiniMap(id, finalTitle);
    UTIL_dispatch(EV_.TITLE_SET, { answerId: id, title: finalTitle });
  }

  /* ───────────────────────────── AUTO-START ───────────────────────────── */

  CORE_AT_boot();

  MOD_OBJ.port = MOD_OBJ.port || {};
  MOD_OBJ.port.boot    = CORE_AT_boot;
  MOD_OBJ.port.dispose = CORE_AT_dispose;

})();