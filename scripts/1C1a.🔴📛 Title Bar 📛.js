// ==UserScript==
// @h2o-id             1c1a.answer.title
// @name               1C1a.🔴📛 Title Bar 📛
// @namespace          H2O.Premium.CGX.answer.title
// @author             HumamDev
// @version            2.5.0
// @revision           001
// @build              260403-000000
// @description        Auto-generate titles for ChatGPT answers + inline editable header; collapse/expand on double-click; sync via shared titles store + events (Contract v2.0 Stage-1).
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

  /* ───────────────────────────── 🔴 STATE — REGISTRIES / CACHES 📄🔓💧 ───────────────────────────── */

  const STATE_ = MOD_OBJ.state = MOD_OBJ.state || {};

  STATE_.booted = STATE_.booted || false;

  STATE_.seen = STATE_.seen || new Set();
  STATE_.pendingTimers = STATE_.pendingTimers || new Map();
  STATE_.mutatedMsgs = STATE_.mutatedMsgs || new Set();

  STATE_.titles = STATE_.titles || {};
  STATE_.collapsed = STATE_.collapsed || new Set(); // NEW: track collapsed answer ids

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

  const ENGINE_loadCollapsed = () => {
    try {
      const raw = UTIL_storage.getStr(KEY_.COLLAPSED_V1, null);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? new Set(arr) : new Set();
    } catch { return new Set(); }
  };

  const ENGINE_saveCollapsed = () => {
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
      UTIL_setAttr(bar, 'data-answer-id', id);
      DOM_enableTitleEditing(bar, id);
      DOM_enableCollapseToggle(bar, msgEl, id);  // NEW
    }
    const textEl = bar.querySelector(DOM_selScoped(UI_.TEXT));
    if (textEl && title) textEl.textContent = title;

    // NEW: restore persisted collapsed state
    if (id && STATE_.collapsed.has(id)) {
      DOM_applyCollapseState(msgEl, bar, true, false);
    }

    return bar;
  };

  const DOM_enableTitleEditing = (bar, answerId) => {
    if (!answerId) return;
    if (UTIL_getAttr(bar, ATTR_.CGXUI_STATE) === 'editable') return;
    UTIL_setAttr(bar, ATTR_.CGXUI_STATE, 'editable');

    const span = bar.querySelector(DOM_selScoped(UI_.TEXT));
    if (!span) return;

    // CHANGED: single-click no longer triggers edit (reserved for double-click collapse on bar)
    // Edit now triggered by clicking the text span directly (not the bar)
    const onClick = (e) => {
      try { e.stopPropagation(); } catch {}
      DOM_startTitleEdit(span, answerId);
    };

    span.addEventListener('click', onClick);
    STATE_.clean.listeners.push(() => span.removeEventListener('click', onClick));
  };

  // ─── NEW: collapse / expand ───────────────────────────────────────────────
  const DOM_enableCollapseToggle = (bar, msgEl, answerId) => {
    if (!bar || !msgEl || !answerId) return;
    if (bar._collapseWired) return;  // idempotent
    bar._collapseWired = true;

    let lastClick = 0;
    const DBLCLICK_MS = 350;

    const onBarDblClick = (e) => {
      // Ignore double-clicks that originate on the editable text span
      const textEl = bar.querySelector(DOM_selScoped(UI_.TEXT));
      if (textEl && textEl.contains(e.target)) return;
      try { e.stopPropagation(); e.preventDefault(); } catch {}
      const router = W.top?.H2O?.CM?.chtmech?.api || W.H2O?.CM?.chtmech?.api || null;
      const routed = router?.routeAnswerTitleDblClick?.({
        answerId,
        bar,
        msgEl,
      });
      if (routed?.handled === true) return;
      DOM_toggleCollapse(msgEl, bar, answerId);
    };

    // Use native dblclick (most reliable cross-browser)
    bar.addEventListener('dblclick', onBarDblClick);
    STATE_.clean.listeners.push(() => bar.removeEventListener('dblclick', onBarDblClick));
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
      });
      // Stamp React-resistant CSS attribute on sibling/toolbar elements
      siblingEls.concat(toolbarEls).forEach(el => {
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
        if (animate) {
          setTimeout(() => { el.style.transition = ''; }, CFG_.COLLAPSE_TRANSITION_MS + 50);
        }
      });
      // Remove React-resistant CSS attribute from sibling/toolbar elements
      siblingEls.concat(toolbarEls).forEach(el => {
        try { el.removeAttribute('data-cgxui-at-hidden'); } catch {}
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
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--h2o-at-wash-color, rgba(255,255,255,0.14)) 26%, rgba(255,255,255,0.10)),
    color-mix(in srgb, var(--h2o-at-wash-color, rgba(255,255,255,0.06)) 12%, rgba(255,255,255,0.03))
  ) !important;
  border-color: color-mix(in srgb, var(--h2o-at-wash-color, rgba(255,255,255,0.18)) 34%, rgba(255,255,255,0.12)) !important;
  box-shadow: 0 0 10px color-mix(in srgb, var(--h2o-at-wash-glow, transparent) 16%, transparent);
}

[${ATTR_.ROLE}="assistant"][${ATTR_.COLLAPSED}="1"] > ${S_BAR} ${S_TEXT}{
  color: var(--h2o-at-wash-text, inherit) !important;
}

[${ATTR_.ROLE}="assistant"][${ATTR_.COLLAPSED}="1"] > ${S_BAR} ${S_LABEL},
[${ATTR_.ROLE}="assistant"][${ATTR_.COLLAPSED}="1"] > ${S_BAR} ${S_ICON}{
  color: color-mix(in srgb, var(--h2o-at-wash-text, currentColor) 72%, transparent) !important;
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
  background: var(--h2o-at-wash-color, #facc15) !important;
  box-shadow: 0 0 6px color-mix(in srgb, var(--h2o-at-wash-glow, #facc15) 44%, transparent) !important;
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
  return !!(id && STATE_.collapsed.has(id));
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
  if (bar && STATE_.collapsed.has(id)) {
    DOM_applyCollapseState(msgEl, bar, true, opts?.animate === true);
    collapseApplied = true;
  }
  return { ok: true, status: 'ok', answerId: id, titleApplied, collapseApplied };
}

MOD_OBJ.api = MOD_OBJ.api || Object.create(null);
MOD_OBJ.api.public = Object.freeze({
  ver: '1.0.0',
  getTitle: API_AT_getTitle,
  setTitle: API_AT_setTitle,
  getTitles: API_AT_getTitles,
  isCollapsed: API_AT_isCollapsed,
  getCollapsedIds: API_AT_getCollapsedIds,
  setCollapsed: API_AT_setCollapsed,
  toggleCollapsed: API_AT_toggleCollapsed,
  getMessageEl: API_AT_getMessageEl,
  getBar: API_AT_getBar,
  ensureBar: API_AT_ensureBar,
  sync: API_AT_sync,
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

    W.addEventListener(EV_.TITLE_SET_LEG, onTitle);
    W.addEventListener(EV_.TITLE_SET, onTitle);
    STATE_.clean.listeners.push(() => W.removeEventListener(EV_.TITLE_SET_LEG, onTitle));
    STATE_.clean.listeners.push(() => W.removeEventListener(EV_.TITLE_SET, onTitle));

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
