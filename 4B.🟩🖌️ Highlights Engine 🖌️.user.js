// ==UserScript==
// @name         4B.🟩🖌️ Highlights Engine 🖌️
// @namespace    H2O.Prime.CGX.InlineHighlighterEngine
// @version      3.2.9
// @description  H2O Contract v2.0 refactor — Inline highlights (XPath + TextPosition + TextQuote) w/ robust persistence (Chrome/GM/LS), Cmd/Ctrl+1 highlight, Cmd/Ctrl+2 cycle, MiniMap sync via H2O bus + legacy DOM events, ControlHub toggle. (CSS migrated to cgxui-*)
// @match        https://chatgpt.com/*
// @author       HumamDev
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// ==/UserScript==

(() => {
  'use strict';

  /* ───────────────────────────── 🧬 Identity (Contract v2.0) ───────────────────────────── */
  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const TOPW = W.top || W;
  const H2O = (W.H2O = W.H2O || {});

  const TOK = 'HE';
  const PID = 'nlnhghlghtr';
  const CID = 'ihighlighter';
  const SkID = 'inhl';
  const BrID = PID;
  const DsID = PID;
  const MODTAG = 'IHighlighter';
  const MODICON = '🖌️';
  const EMOJI_HDR = '🟩';
  const SUITE = 'prm';
  const HOST = 'cgx';

  // Vault (Contract): H2O[TOK][BrID] = { diag, state, api }
  const MODROOT = (H2O[TOK] ||= {});
  const MOD = (MODROOT[BrID] ||= {});
  const STATE = (MOD.state ||= { installed: false, enabled: true, booted: false });

  if (STATE.installed) return;
  STATE.installed = true;

  const DIAG = (MOD.diag ||= {
    bootCount: 0,
    disposedCount: 0,
    lastBootAt: 0,
    lastDisposeAt: 0,
    steps: [],
    lastError: null
  });

  const DIAG_step = (m) => { try { DIAG.steps.push({ t: Date.now(), m: String(m || '') }); } catch {} };
  const DIAG_fail = (err) => { try { DIAG.lastError = String(err?.stack || err || ''); } catch {} };

  /* ───────────────────────────── ⚙️ CFG_ (no magic) ───────────────────────────── */
  const CFG_DEBUG = true;
  const CFG_RESTORE_DEBOUNCE_MS = 250;
  const CFG_STABLE_WINDOW_MS = 400;
  const CFG_SAVE_DEBOUNCE_MS = 250;
  const CFG_UNSTABLE_RETRY_MAX = 12;
  const CFG_UNSTABLE_RETRY_BASE_MS = 200;
  const CFG_UNSTABLE_RETRY_STEP_MS = 60;

  const CFG_REFRESH_STABLE_MAX_WAIT_MS = 4500;
  const CFG_REFRESH_STABLE_FRAMES = 3;

  const CFG_MIRROR_LEGACY_KEYS = false;
  const CFG_MIRROR_ALIAS_KEYS = false;

  /* ───────────────────────────── KEY_ (Disk) ───────────────────────────── */
  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;

  const KEY_DISK_CANON = `${NS_DISK}:state:inline_highlights:v3`;
  const KEY_DISK_CANON_ALIAS_V3 = 'h2o:inlineHighlights.v3';
  const KEY_DISK_PUBLIC_SIMPLE = 'h2o:inlineHighlights';
  const KEY_DISK_FUTURE_ALIAS_V2 = 'h2o:inlineHighlights.v2';
  const KEY_DISK_LEGACY_HO_V2 = 'ho:inlineHighlights.v2';
  const KEY_DISK_LEGACY_HO_V1 = 'ho:inlineHighlights';

  const LEGACY_DISK_KEYS = Object.freeze([
    KEY_DISK_CANON_ALIAS_V3,
    KEY_DISK_PUBLIC_SIMPLE,
    KEY_DISK_FUTURE_ALIAS_V2,
    KEY_DISK_LEGACY_HO_V2,
    KEY_DISK_LEGACY_HO_V1,
  ]);

  const KEY_MIG_DISK_V1 = `${NS_DISK}:migrate:inline_highlights:v1`;

  /* ───────────────────────────── EV_ (Bus + DOM) ───────────────────────────── */
  const EV_BUS_INLINE_CHANGED = 'inline:changed';

  const EV_DOM_CGXUI_INLINE_CHANGED = 'cgxui-inline:changed';
  const EV_DOM_H2O_INLINE_CHANGED = 'h2o:inline:changed';

  const EV_DOM_CGXUI_HL_CHANGED_A = 'h2o:highlight-changed';
  const EV_DOM_CGXUI_HL_CHANGED_B = 'h2o:highlightsChanged';
  const EV_DOM_H2O_HL_CHANGED = 'h2o:highlightsChanged';

  const EV_DOM_CGXUI_MSG_REMOUNTED = 'h2o:message-remounted';

  /* ───────────────────────────── SEL_ ───────────────────────────── */
  const SEL_ANSWER = '[data-message-author-role="assistant"]';
  const SEL_MSG = '[data-message-author-role="assistant"], [data-message-author-role="user"]';
  const SEL_MAIN = 'main';

  /* ───────────────────────────── ATTR_ ───────────────────────────── */
  const ATTR_HL_ID = 'data-highlight-id';
  const ATTR_HL_COLOR = 'data-highlight-color';
  const ATTR_ANSWER_ID = 'data-answer-id';

  /* ───────────────────────────── CGXUI (owned UI hooks) ───────────────────────────── */
  const ATTR_CGX_OWNER = 'data-cgxui-owner';
  const ATTR_CGX_UI = 'data-cgxui';
  const ATTR_CGX_STATE = 'data-cgxui-state';

  const CSS_STYLE_ID = `cgxui-${SkID}-style`;

  /* ───────────────────────────── CSS_ ───────────────────────────── */

  const CSS_CLS_HL = `cgxui-${SkID}-inline-hl`;
  const CSS_CLS_TOOLS = `cgxui-${SkID}-hl-tools`;
  const CSS_CLS_SWATCH = `cgxui-${SkID}-hl-swatch`;
  const CSS_CLS_SWATCH_WRAP = `cgxui-${SkID}-hl-swatches`;

  const CGX_UI_TOOLS = `${SkID}-tools`;
  const CGX_UI_SWATCH = `${SkID}-swatch`;

  /* ───────────────────────────── 🎨 Palette ───────────────────────────── */
  const PALETTE = [
    { title: 'blue',   color: '#3B82F6' },
    { title: 'red',    color: '#FF4C4C' },
    { title: 'green',  color: '#22C55E' },
    { title: 'gold',   color: '#FFD54F' },
    { title: 'sky',    color: '#7DD3FC' },
    { title: 'pink',   color: '#F472B6' },
    { title: 'purple', color: '#A855F7' },
    { title: 'orange', color: '#FF914D' },
  ];
  const CFG_DEFAULT_COLOR = 'gold';

  /* ───────────────────────────── ⌨️ Hotkeys ───────────────────────────── */
  const KEY_HIGHLIGHT = 'Digit1';
  const KEY_CYCLE = 'Digit2';

  /* ───────────────────────────── 🧰 UTIL_ ───────────────────────────── */
  const log = (...a) => { if (CFG_DEBUG) console.log(`[H2O.${MODTAG}]`, ...a); };

  const UTIL_isMac = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const UTIL_debounce = (fn, wait) => { let t = null; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; };
  const UTIL_hashText = (s) => { let h = 5381, i = s.length; while (i) h = (h * 33) ^ s.charCodeAt(--i); return h >>> 0; };
  const UTIL_textOf = (el) => (el && el.textContent) ? el.textContent : '';

  const UTIL_cssEsc = (s) => {
    try { return CSS.escape(String(s)); }
    catch { return String(s).replace(/["\\]/g, '\\$&'); }
  };

  const UTIL_safeParse = (s, fallback) => {
    try {
      if (s && typeof s === 'object') return s;
      return JSON.parse(String(s));
    } catch {
      return fallback;
    }
  };

  const UTIL_getChatId = () => {
    const m = location.pathname.match(/\/c\/([a-z0-9-]+)/i);
    return m ? m[1] : '';
  };

  const UTIL_getConvoKey = () => {
    const id = UTIL_getChatId() || '';
    return id ? `c/${id}` : 'c/unknown';
  };

  const UTIL_timerSet = new Set();
  const UTIL_setTimeout = (fn, ms) => {
    const t = setTimeout(() => { UTIL_timerSet.delete(t); fn(); }, ms);
    UTIL_timerSet.add(t);
    return t;
  };
  const UTIL_clearAllTimers = () => { for (const t of Array.from(UTIL_timerSet)) clearTimeout(t); UTIL_timerSet.clear(); };

  const UTIL_unsubs = [];
  const UTIL_on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    const off = () => { try { target.removeEventListener(type, fn, opts); } catch {} };
    UTIL_unsubs.push(off);
    return off;
  };
  const UTIL_offAll = () => { while (UTIL_unsubs.length) { try { UTIL_unsubs.pop()(); } catch {} } };

  /* ───────────────────────────── 🧩 Bridge: minimal H2O.msg (if Core not loaded yet) ───────────────────────────── */
  H2O.msg = H2O.msg || {};
  H2O.msg.normalizeId = H2O.msg.normalizeId || ((id) => String(id || '').replace(/^conversation-turn-/, '').trim());
  H2O.msg.getIdFromEl = H2O.msg.getIdFromEl || ((el) => {
    if (!el) return '';
    if (el?.dataset?.h2oUid) return H2O.msg.normalizeId(el.dataset.h2oUid);
    if (el?.dataset?.hoUid) {
      // migrate legacy attr to new key
      try { el.dataset.h2oUid = el.dataset.hoUid; } catch {}
      return H2O.msg.normalizeId(el.dataset.hoUid);
    }

    const mid =
      el.getAttribute?.('data-message-id') ||
      el.dataset?.messageId ||
      el.getAttribute?.('data-cgxui-id') ||
      el.dataset?.h2oId ||
      el.dataset?.hoId ||
      el.getAttribute?.('data-cgxui-uid') ||
      el.dataset?.h2oUid ||
      el.dataset?.hoUid ||
      '';

    if (mid) return H2O.msg.normalizeId(mid);

    const t = el.dataset?.testid || el.dataset?.testId || el.getAttribute?.('data-testid') || '';
    if (t && t.startsWith('conversation-turn-')) return H2O.msg.normalizeId(t);

    return '';
  });

  /* ───────────────────────────── 📌 Message helpers ───────────────────────────── */
  W.ANSWER_SEL = W.ANSWER_SEL || SEL_ANSWER;

  const MSG_isSoftUnmounted = (el) => {
    if (!el) return false;
    if (el.dataset && el.dataset.h2oUnmounted === '1') return true;
    if (el.dataset && el.dataset.hoUnmounted === '1') {
      try { el.dataset.h2oUnmounted = '1'; } catch {}
      return true;
    }
    if (el.classList?.contains('cgxui-unmounted-placeholder')) return true;
    if (el.querySelector?.('.cgxui-unmounted-placeholder')) return true;
    return false;
  };

  const MSG_getPairNoFromEl = (el) => {
    const turn = el?.closest?.('[data-testid^="conversation-turn-"]');
    const tid = turn?.getAttribute?.('data-testid') || '';
    const m = tid.match(/conversation-turn-(\d+)/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) ? (n + 1) : null;
  };

  const MSG_getAnswerId = (el) => {
    const coreId = H2O.msg?.getIdFromEl?.(el);
    if (coreId) return coreId;

    return el?.getAttribute?.('data-message-id')
      || el?.id
      || (el?.dataset?.testid?.includes?.('message') ? el.dataset.testid : null)
      || `idx_${Array.from(document.querySelectorAll(SEL_ANSWER)).indexOf(el)}`;
  };

  const MSG_isUnstableAnswerId = (id) => {
    if (!id) return true;
    const s = String(id).trim();
    if (!s) return true;
    if (s === 'null' || s === 'undefined') return true;
    if (/^idx_\d+$/.test(s)) return true;
    if (/^message_\d+$/.test(s)) return true;
    return false;
  };

  const MSG_findContainer = (node) => {
    let el = (node && (node.nodeType === 1 ? node : node.parentElement));
    while (el && el !== document.body) {
      if (el.matches?.(SEL_ANSWER)) return el;

      const role = el.getAttribute?.('data-message-author-role');
      if (role === 'assistant' || role === 'user') return el;

      if (el.hasAttribute?.('data-message-id')) return el;

      if (el.classList?.contains('prose') || el.matches?.('.markdown')) {
        const owner = el.closest?.(SEL_ANSWER);
        return owner || el.closest?.(SEL_MSG) || el;
      }
      el = el.parentElement;
    }
    return null;
  };

  const MSG_getById = (id) => {
    if (!id) return null;
    const direct =
      document.querySelector(`${SEL_ANSWER}[data-message-id="${id}"]`) ||
      document.querySelector(`${SEL_ANSWER}[id="${id}"]`);
    if (direct) return direct;

    const all = document.querySelectorAll(SEL_ANSWER);
    for (const el of all) {
      if (MSG_getAnswerId(el) === id) return el;
    }
    return null;
  };

  /* ───────────────────────────── 💾 UTIL_storage (Chrome → GM → localStorage) ───────────────────────────── */
  const UTIL_storage = (() => {
    const hasGM = (typeof GM_getValue === 'function') && (typeof GM_setValue === 'function');
    // In Tampermonkey, a partial chrome.* bridge may exist but can fail internally
    // (e.g. runtime.connect missing). Prefer GM storage whenever available.
    const hasChrome = !hasGM
      && typeof chrome !== 'undefined'
      && (typeof chrome?.storage?.local?.get === 'function')
      && (typeof chrome?.storage?.local?.set === 'function')
      && (typeof chrome?.storage?.local?.remove === 'function');

    let cache = null;
    let dirty = false;
    let saveTimer = null;

    let onChangedListener = null;
    let onStorageListener = null;

    const _readKey = async (key) => {
      if (!key) return {};
      try {
        if (hasChrome) {
          return await new Promise(resolve => chrome.storage.local.get([key], r => resolve(r?.[key] || {})));
        }
        if (hasGM) {
          const raw = GM_getValue(key, null);
          if (!raw) return {};
          if (typeof raw === 'object') return raw;
          return UTIL_safeParse(raw, {}) || {};
        }
        const rawLS = localStorage.getItem(key);
        if (!rawLS) return {};
        return UTIL_safeParse(rawLS, {}) || {};
      } catch {
        return {};
      }
    };

    const _writeKey = async (key, obj) => {
      if (!key) return;
      try {
        if (hasChrome) {
          await new Promise(resolve => chrome.storage.local.set({ [key]: obj }, resolve));
          return;
        }
        if (hasGM) {
          GM_setValue(key, JSON.stringify(obj));
          return;
        }
        localStorage.setItem(key, JSON.stringify(obj));
      } catch (err) {
        console.warn(`[H2O.${MODTAG}] disk write failed`, key, err);
      }
    };

    const _delKey = async (key) => {
      if (!key) return;
      try {
        if (hasChrome) {
          await new Promise(resolve => chrome.storage.local.remove([key], resolve));
          return;
        }
        if (hasGM) {
          GM_deleteValue(key);
          return;
        }
        localStorage.removeItem(key);
      } catch {}
    };

    const _readRaw = async () => {
      const canon = await _readKey(KEY_DISK_CANON);
      if (canon && typeof canon === 'object' && Object.keys(canon).length) return canon;

      for (const k of LEGACY_DISK_KEYS) {
        const v = await _readKey(k);
        if (v && typeof v === 'object' && Object.keys(v).length) return v;
      }
      return {};
    };

    const _writeRaw = async (obj) => {
      await _writeKey(KEY_DISK_CANON, obj);

      if (CFG_MIRROR_ALIAS_KEYS) {
        await _writeKey(KEY_DISK_CANON_ALIAS_V3, obj);
        await _writeKey(KEY_DISK_FUTURE_ALIAS_V2, obj);
      }

      if (CFG_MIRROR_LEGACY_KEYS) {
        await _writeKey(KEY_DISK_LEGACY_HO_V2, obj);
      }
    };

    const _scheduleSave = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        if (!dirty || cache == null) return;
        dirty = false;
        await _writeRaw(cache);
        if (CFG_DEBUG) console.log(`[H2O.${MODTAG}] saved`);
      }, CFG_SAVE_DEBOUNCE_MS);
    };

    const _initCrossTab = () => {
      if (hasChrome && chrome.storage?.onChanged) {
        onChangedListener = (changes, area) => {
          if (area !== 'local') return;

          const pick = (k) => (changes[k] ? (changes[k].newValue || {}) : null);

          const vCanon = pick(KEY_DISK_CANON);
          if (vCanon) cache = vCanon;
        };
        chrome.storage.onChanged.addListener(onChangedListener);
      } else {
        onStorageListener = (e) => {
          if (!e?.key) return;
          const k = String(e.key);
          if (k !== KEY_DISK_CANON) return;
          try { cache = JSON.parse(e.newValue || '{}'); } catch {}
        };
        window.addEventListener('storage', onStorageListener);
      }
    };

    const _disposeCrossTab = () => {
      try {
        if (hasChrome && onChangedListener && chrome.storage?.onChanged?.removeListener) {
          chrome.storage.onChanged.removeListener(onChangedListener);
        }
      } catch {}
      try {
        if (onStorageListener) window.removeEventListener('storage', onStorageListener);
      } catch {}
      onChangedListener = null;
      onStorageListener = null;
    };

    return {
      async init() { cache = await _readRaw(); _initCrossTab(); return cache; },
      dispose() { _disposeCrossTab(); },
      readSync() { return cache || {}; },
      async reload() { cache = await _readRaw(); return cache; },
      writeSync(updaterOrObj) {
        if (!cache) cache = {};
        const draft = UTIL_safeParse(JSON.stringify(cache || {}), {});
        const next = (typeof updaterOrObj === 'function') ? (updaterOrObj(draft) || draft) : (updaterOrObj || draft);
        cache = next;
        dirty = true;
        _scheduleSave();
        return cache;
      },
      saveNow: async () => { if (dirty) { dirty = false; await _writeRaw(cache || {}); } },
      delKey: _delKey
    };
  })();

  const HAS_GM_STORAGE = (typeof GM_getValue === 'function') && (typeof GM_setValue === 'function') && (typeof GM_deleteValue === 'function');
  const HAS_CHROME_STORAGE = !HAS_GM_STORAGE
    && typeof chrome !== 'undefined'
    && (typeof chrome?.storage?.local?.get === 'function')
    && (typeof chrome?.storage?.local?.set === 'function')
    && (typeof chrome?.storage?.local?.remove === 'function');

  const UTIL_mig_getFlag = async (key) => {
    try {
      if (HAS_CHROME_STORAGE) {
        return await new Promise(resolve => chrome.storage.local.get([key], r => resolve(r?.[key] || null)));
      }
      if (HAS_GM_STORAGE) {
        return GM_getValue(key, null);
      }
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const UTIL_mig_setFlag = async (key, val) => {
    try {
      if (HAS_CHROME_STORAGE) {
        await new Promise(resolve => chrome.storage.local.set({ [key]: String(val) }, resolve));
        return;
      }
      if (HAS_GM_STORAGE) {
        GM_setValue(key, String(val));
        return;
      }
      localStorage.setItem(key, String(val));
    } catch {}
  };

  const MIG_disk_legacy_to_canon_once = async () => {
    try {
      const done = await UTIL_mig_getFlag(KEY_MIG_DISK_V1);
      if (done === '1') return;
    } catch {}

    try {
      const s0 = STORE_read() || {};
      if (s0 && Object.keys(s0).length) {
        UTIL_storage.writeSync(d => d);
        await UTIL_storage.saveNow();
      }
    } catch {}

    try {
      for (const k of LEGACY_DISK_KEYS) {
        await UTIL_storage.delKey(k);
      }
    } catch {}

    try { await UTIL_mig_setFlag(KEY_MIG_DISK_V1, '1'); } catch {}
  };

  const STORE_read = () => UTIL_storage.readSync();
  const STORE_write = (u) => UTIL_storage.writeSync(u);

  /* ───────────────────────────── 🧱 Store shape ───────────────────────────── */
  const STORE_ensureShape = (draft) => {
    draft.itemsByAnswer = draft.itemsByAnswer || {};
    draft._meta = draft._meta || { currentColor: CFG_DEFAULT_COLOR };
    if (!draft._meta.currentColor) draft._meta.currentColor = CFG_DEFAULT_COLOR;
    if (!draft.convoId) draft.convoId = UTIL_getConvoKey();
    return draft;
  };

  const STORE_getCurrentColor = () => {
    const s = STORE_read();
    const c = (s && s._meta && s._meta.currentColor) || CFG_DEFAULT_COLOR;
    return c || CFG_DEFAULT_COLOR;
  };

  const STORE_setCurrentColor = (title) => {
    STORE_write(d => { STORE_ensureShape(d); d._meta.currentColor = title || CFG_DEFAULT_COLOR; return d; });
  };

  const PAL_colorDef = (name) => {
    const found = PALETTE.find(p => p.title === name);
    if (found) return found;
    const def = PALETTE.find(p => p.title === CFG_DEFAULT_COLOR);
    return def || PALETTE[0];
  };

  const PAL_nextName = (cur) => {
    const names = PALETTE.map(p => p.title);
    const i = Math.max(0, names.indexOf(cur));
    return names[(i + 1) % names.length];
  };

  const STORE_colorsFrom = (answerId) => {
    const s = STORE_read();
    const list = s?.itemsByAnswer?.[answerId] || [];
    const hex = list.map(h => (PAL_colorDef(h.color)?.color) || '').filter(Boolean);
    return Array.from(new Set(hex));
  };

  /* ───────────────────────────── 🧠 Text flatten + anchors ───────────────────────────── */
  const TXT_flatten = (root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.nodeValue?.length ? NodeFilter.FILTER_ACCEPT : NodeFilter.REJECT
    });
    let plain = '', map = [], acc = 0, n;
    while ((n = walker.nextNode())) {
      const len = n.nodeValue.length;
      map.push({ node: n, start: acc, end: acc + len });
      acc += len;
      plain += n.nodeValue;
    }
    return { plain, map, length: plain.length };
  };

  const TXT_rangeToPos = (range, root) => {
    const { map } = TXT_flatten(root);
    const nodeOffset = (node, offset) => {
      for (const seg of map) if (seg.node === node) return seg.start + offset;
      return null;
    };
    const s = nodeOffset(range.startContainer, range.startOffset);
    const e = nodeOffset(range.endContainer, range.endOffset);
    return (s == null || e == null) ? null : { start: s, end: e };
  };

  const TXT_posToRange = (pos, root) => {
    const { map, length } = TXT_flatten(root);
    if (!pos || pos.start < 0 || pos.end > length || pos.start >= pos.end) return null;

    const locate = (off) => {
      for (const seg of map) if (off >= seg.start && off <= seg.end) return { node: seg.node, offset: off - seg.start };
      return null;
    };

    const a = locate(pos.start), b = locate(pos.end);
    if (!a || !b) return null;
    const r = document.createRange();
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    return r;
  };

  const TXT_sliceBounds = (str, start, end) => str.slice(Math.max(0, start), Math.min(str.length, end));
  const TXT_normalizeString = (value) => String(value || '').replace(/\s+/g, ' ').trim();

  const TXT_rangeToQuote = (range, root, ctx = 32) => {
    const { plain } = TXT_flatten(root);
    const pos = TXT_rangeToPos(range, root);
    if (!pos) return null;
    const exact = plain.slice(pos.start, pos.end);
    const prefix = TXT_sliceBounds(plain, pos.start - ctx, pos.start);
    const suffix = TXT_sliceBounds(plain, pos.end, pos.end + ctx);
    return { exact, prefix, suffix, approx: pos.start };
  };

  const TXT_findByQuote = (root, quote) => {
    if (!quote || !quote.exact) return null;
    const { plain } = TXT_flatten(root);
    const approx = Number.isFinite(quote.approx)
      ? Math.max(0, Math.min(plain.length, Math.floor(quote.approx)))
      : null;
    const prefix = quote.prefix || '';
    const suffix = quote.suffix || '';
    const matches = [];

    for (let idx = plain.indexOf(quote.exact); idx !== -1; idx = plain.indexOf(quote.exact, idx + 1)) {
      const start = idx;
      const end = start + quote.exact.length;
      const hasPrefix = !prefix || plain.slice(Math.max(0, start - prefix.length), start).endsWith(prefix);
      if (!hasPrefix) continue;
      const hasSuffix = !suffix || plain.slice(end, end + suffix.length).startsWith(suffix);
      if (!hasSuffix) continue;
      const dist = approx != null ? Math.abs(start - approx) : 0;
      matches.push({ start, dist });
    }

    if (!matches.length) return null;
    matches.sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist;
      return a.start - b.start;
    });

    const bestStart = matches[0].start;
    return TXT_posToRange({ start: bestStart, end: bestStart + quote.exact.length }, root);
  };

  const TXT_rangeMatchesQuote = (range, quote) => {
    if (!range) return false;
    if (!quote || !quote.exact) return true;
    const actual = range.toString();
    if (actual === quote.exact) return true;
    return TXT_normalizeString(actual) === TXT_normalizeString(quote.exact);
  };

  /* ───────────────────────────── 🧭 XPath helpers ───────────────────────────── */
  const XP_firstText = (el) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    return w.nextNode();
  };
  const XP_lastText = (el) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let last = null, n;
    while ((n = w.nextNode())) last = n;
    return last;
  };

  const XP_siblingIndex = (n) => { let i = 1, p = n; while ((p = p.previousSibling)) if (p.nodeName === n.nodeName) i++; return i; };

  const XP_fromNode = (node, root) => {
    if (!node || node === root) return '.';
    const parts = [];
    while (node && node !== root) {
      parts.unshift(`${node.nodeName.toLowerCase()}[${XP_siblingIndex(node)}]`);
      node = node.parentNode;
    }
    return './/' + parts.join('/');
  };

  const XP_nodeFrom = (xpath, root = document) => {
    try {
      const r = document.evaluate(xpath, root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      if (r.singleNodeValue) return r.singleNodeValue;
    } catch (e) {
      console.warn(`[H2O.${MODTAG}] XPath eval failed`, xpath, e);
    }

    const base = xpath.replace(/\/#text\[\d+\]$/, '');
    try {
      const candidate = document.evaluate(base, root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (candidate) {
        const tn = XP_firstText(candidate);
        if (tn) return tn;
      }
    } catch {}
    return null;
  };

  const XP_rangeToSerializable = (range, scopeRoot) => {
    let startNode = range.startContainer;
    let endNode = range.endContainer;

    if (startNode.nodeType !== 3) startNode = XP_firstText(startNode) || startNode.firstChild;
    if (endNode.nodeType !== 3) endNode = XP_lastText(endNode) || endNode.lastChild;

    return {
      startXPath: XP_fromNode(startNode, scopeRoot),
      startOffset: range.startOffset,
      endXPath: XP_fromNode(endNode, scopeRoot),
      endOffset: range.endOffset,
    };
  };

  const XP_serializableToRange = (obj, scopeRoot) => {
    if (!obj || !obj.startXPath || !obj.endXPath) return null;
    const clean = (p) => String(p).replace(/\/#text\[\d+\]/g, '');
    const startXPath = clean(obj.startXPath);
    const endXPath = clean(obj.endXPath);

    const startNode = XP_nodeFrom(startXPath, scopeRoot);
    const endNode = XP_nodeFrom(endXPath, scopeRoot);
    if (!startNode || !endNode) return null;

    let sNode = (startNode.nodeType === 3) ? startNode : (XP_firstText(startNode) || startNode.firstChild);
    let eNode = (endNode.nodeType === 3) ? endNode : (XP_lastText(endNode) || endNode.lastChild);
    if (!sNode || !eNode) return null;

    let sOff = obj.startOffset ?? 0;
    while (sNode && sOff > (sNode.nodeValue?.length ?? 0)) {
      sOff -= (sNode.nodeValue?.length ?? 0);
      do { sNode = sNode.nextSibling; if (!sNode) return null; } while (sNode.nodeType !== 3);
    }

    let eOff = obj.endOffset ?? 0;
    while (eNode && eOff > (eNode.nodeValue?.length ?? 0)) {
      eOff -= (eNode.nodeValue?.length ?? 0);
      do { eNode = eNode.nextSibling; if (!eNode) return null; } while (eNode.nodeType !== 3);
    }

    const r = document.createRange();
    try { r.setStart(sNode, sOff); r.setEnd(eNode, eOff); } catch { return null; }
    return r;
  };

  /* ───────────────────────────── 🧷 Wrapping / unwrapping ───────────────────────────── */
  const HL_isMark = (el) => el && el.nodeType === 1 && el.classList?.contains(CSS_CLS_HL);

  const HL_splitText = (node, offset) => {
    if (node.nodeType !== 3) return node;
    if (offset <= 0 || offset >= node.nodeValue.length) return node;
    return node.splitText(offset);
  };

  const HL_constrainToAncestor = (range, ancestor) => {
    const r = range.cloneRange();
    if (!ancestor.contains(r.startContainer)) {
      const start = XP_firstText(ancestor);
      if (!start) return null;
      r.setStart(start, 0);
    }
    if (!ancestor.contains(r.endContainer)) {
      const end = XP_lastText(ancestor);
      if (!end) return null;
      r.setEnd(end, end.nodeValue?.length || 0);
    }
    return r;
  };

  const HL_textNodesInRange = (range, root) => {
    if (!range) return [];
    const container = root || range.commonAncestorContainer || document.querySelector(SEL_ANSWER);
    if (!container) return [];
    const baseEl = (container.nodeType === 1) ? container : container.parentElement;
    if (!baseEl) return [];
    const answer = baseEl.closest?.(SEL_ANSWER) || baseEl;

    const strictNodes = [];
    try {
      const walker = document.createTreeWalker(answer, NodeFilter.SHOW_TEXT, null);
      let n;
      while ((n = walker.nextNode())) {
        if (!n.nodeValue || !n.nodeValue.trim()) continue;

        let overlaps = false;
        try { if (typeof range.intersectsNode === 'function') overlaps = range.intersectsNode(n); } catch {}

        if (!overlaps) {
          try {
            const r2 = document.createRange();
            r2.selectNodeContents(n);
            overlaps = !(
              range.compareBoundaryPoints(Range.END_TO_START, r2) <= 0 ||
              range.compareBoundaryPoints(Range.START_TO_END, r2) >= 0
            );
          } catch {}
        }

        if (overlaps) strictNodes.push(n);
      }
    } catch (err) {
      console.warn(`[H2O.${MODTAG}] walker failed`, err);
    }

    if (strictNodes.length) return strictNodes;

    const broad = [];
    answer.querySelectorAll('*').forEach(el => {
      el.childNodes.forEach(c => { if (c.nodeType === 3 && c.nodeValue && c.nodeValue.trim()) broad.push(c); });
    });
    return broad;
  };

  const HL_markFactory = (colorHex, id, ansId, colorName) => {
    const m = document.createElement('mark');

    m.className = CSS_CLS_HL;

    // ✅ cgxui ownership (Contract)
    m.setAttribute(ATTR_CGX_OWNER, SkID);

    m.setAttribute(ATTR_HL_ID, id);
    if (ansId) m.setAttribute(ATTR_ANSWER_ID, ansId);
    if (colorName) m.setAttribute(ATTR_HL_COLOR, colorName);

    m.style.setProperty('--hl-color', colorHex);
    return m;
  };

  const HL_mergeAdjacent = (el) => {
    if (!HL_isMark(el)) return;
    const next = el.nextSibling;
    if (HL_isMark(next) && next.getAttribute(ATTR_HL_ID) === el.getAttribute(ATTR_HL_ID)) {
      while (next.firstChild) el.appendChild(next.firstChild);
      next.remove();
      HL_mergeAdjacent(el);
    }
  };

  const HL_setMarkColor = (el, colorName) => {
    const def = PAL_colorDef(colorName);
    el.setAttribute(ATTR_HL_COLOR, colorName);

    // expose token for other modules (DockPanel/HighlightsTab) without hex guessing
    el.dataset.color = colorName;
    el.dataset.highlightColor = colorName;
    el.dataset.h2oInlineColor = colorName;
    el.style.setProperty('--hl-color', def.color);
  };

  const HL_updateStoreColor = (answerId, id, newColor) => {
    STORE_write(d => {
      STORE_ensureShape(d);
      const list = d.itemsByAnswer[answerId] || [];
      const item = list.find(h => h.id === id);
      if (item) item.color = newColor || CFG_DEFAULT_COLOR;
      return d;
    });
  };

  const HL_removeStoreItem = (answerId, id) => {
    STORE_write(d => {
      STORE_ensureShape(d);
      const list = d.itemsByAnswer[answerId] || [];
      d.itemsByAnswer[answerId] = list.filter(h => h.id !== id);
      return d;
    });
  };

  const HL_wrapRange = (range, colorTitle, answerId, existingId) => {
    if (!range || range.collapsed) return null;

    const def = PAL_colorDef(colorTitle || CFG_DEFAULT_COLOR);
    const hlId = existingId || `hl_${Math.random().toString(36).slice(2, 9)}`;
    let inserted = 0;

    try {
      if (range.startContainer.nodeType !== 3) {
        const s = XP_firstText(range.startContainer) || range.startContainer.firstChild;
        if (s && s.nodeType === 3) range.setStart(s, 0);
      }
      if (range.endContainer.nodeType !== 3) {
        const e = XP_lastText(range.endContainer) || range.endContainer.lastChild;
        if (e && e.nodeType === 3) range.setEnd(e, e.nodeValue.length);
      }
    } catch (err) {
      log('wrapRange normalize failed', err);
      return null;
    }

    const sRight = HL_splitText(range.startContainer, range.startOffset);
    if (sRight && sRight !== range.startContainer) range.setStart(sRight, 0);
    HL_splitText(range.endContainer, range.endOffset);

    const answerRoot = MSG_getById(answerId) || MSG_findContainer(range.commonAncestorContainer) || range.commonAncestorContainer;
    const nodes = HL_textNodesInRange(range, answerRoot);
    if (!nodes.length) return null;

    for (const tn of nodes) {
      let start = 0, end = tn.nodeValue.length;
      if (tn === range.startContainer) start = range.startOffset;
      if (tn === range.endContainer) end = range.endOffset;
      if (end <= start) continue;

      const slice = tn.nodeValue.slice(start, end);
      if (!slice || !slice.trim()) continue;

      const existingParent = tn.parentElement && tn.parentElement.closest?.(`.${CSS_CLS_HL}`);
      if (existingParent) {
        const pid = existingParent.getAttribute(ATTR_HL_ID);
        if (pid) {
          HL_setMarkColor(existingParent, colorTitle || CFG_DEFAULT_COLOR);
          HL_updateStoreColor(answerId, pid, colorTitle || CFG_DEFAULT_COLOR);
        }
        continue;
      }

      HL_splitText(tn, end);
      const mid = HL_splitText(tn, start);

      const m = HL_markFactory(def.color, hlId, answerId, (colorTitle || CFG_DEFAULT_COLOR));
      mid.parentNode.insertBefore(m, mid);
      m.appendChild(mid);

      // dataset hook (still useful)
      m.dataset.highlightColor = colorTitle || CFG_DEFAULT_COLOR;
      m.dataset.h2oInlineColor = colorTitle || CFG_DEFAULT_COLOR;

      HL_mergeAdjacent(m.previousSibling);
      HL_mergeAdjacent(m);
      inserted++;
    }

    const answerEl = MSG_getById(answerId);
    if (answerEl) {
      answerEl.querySelectorAll('mark mark').forEach(inner => {
        const parent = inner.parentNode;
        while (inner.firstChild) parent.insertBefore(inner.firstChild, inner);
        inner.remove();
        parent.normalize?.();
      });
    }

    return inserted ? { id: hlId } : null;
  };

  const HL_unwrapById = (id, scopeEl) => {
    const root = scopeEl || document;
    const els = root.querySelectorAll(`.${CSS_CLS_HL}[${ATTR_HL_ID}="${UTIL_cssEsc(id)}"]`);
    els.forEach(el => {
      const p = el.parentNode;
      while (el.firstChild) p.insertBefore(el.firstChild, el);
      p.removeChild(el);
      p.normalize?.();
    });
  };

  /* ───────────────────────────── 🧠 Anchors → range ───────────────────────────── */
  const HL_resolveAnchors = (item, root) => {
    const anchors = item.anchors || {};
    if (!anchors || typeof anchors !== 'object') return null;

    if (anchors.textQuote) {
      const r = TXT_findByQuote(root, anchors.textQuote);
      if (r && !r.collapsed) return r;
    }
    if (anchors.textPos) {
      const r = TXT_posToRange(anchors.textPos, root);
      if (r && !r.collapsed && TXT_rangeMatchesQuote(r, anchors.textQuote)) return r;
    }
    if (anchors.xpath) {
      const r = XP_serializableToRange(anchors.xpath, root);
      if (r && !r.collapsed) return r;
    }
    return null;
  };

  /* ───────────────────────────── 🚌 Signals ───────────────────────────── */
  const HL_collectDomColors = (msgEl) => {
    const set = new Set();
    msgEl.querySelectorAll('.' + CSS_CLS_HL).forEach(m => {
      const c = m.style.getPropertyValue('--hl-color') || m.dataset.color || '';
      if (c) set.add(c);
    });
    return Array.from(set);
  };

  const HL_emitInlineChanged = (msgElOrId) => {
    const el = (typeof msgElOrId === 'string')
      ? (MSG_getById(msgElOrId) || W.document.querySelector(`[data-message-id="${msgElOrId}"]`))
      : msgElOrId;

    if (!el) return;

    const answerId = MSG_getAnswerId(el);
    const domColors = HL_collectDomColors(el);
    const storeCols = STORE_colorsFrom(answerId);
    const colors = domColors.length ? domColors : storeCols;

    const detail = { answerId, colors, source: 'highlighter', ts: Date.now() };

    if (H2O?.events?.emit) {
      H2O.events.emit(EV_BUS_INLINE_CHANGED, detail);
      return;
    }

    try { W.dispatchEvent(new CustomEvent(EV_DOM_CGXUI_INLINE_CHANGED,  { detail, bubbles: true, composed: true })); } catch {}
    try { W.dispatchEvent(new CustomEvent(EV_DOM_H2O_INLINE_CHANGED, { detail, bubbles: true, composed: true })); } catch {}
    try { W.dispatchEvent(new CustomEvent(`evt:h2o:inline:changed`, { detail, bubbles: true, composed: true })); } catch {}
    try { W.dispatchEvent(new CustomEvent(`h2o-inline:changed`, { detail, bubbles: true, composed: true })); } catch {}
  };

  const HL_notifyChanged = (answerId) => {
    try { W.dispatchEvent(new CustomEvent(EV_DOM_CGXUI_HL_CHANGED_A, { detail: { id: answerId } })); } catch {}
    try { W.dispatchEvent(new CustomEvent(EV_DOM_CGXUI_HL_CHANGED_B, { detail: { answerId } })); } catch {}
    try { W.dispatchEvent(new CustomEvent(EV_DOM_H2O_HL_CHANGED,  { detail: { answerId } })); } catch {}
  };

  /* ───────────────────────────── 💾 Save highlight ───────────────────────────── */
  const HL_save = (answerId, payload) => {
    const enriched = { ...payload, convoId: UTIL_getConvoKey() };
    if (enriched.pairNo == null) enriched.pairNo = MSG_getPairNoFromEl(MSG_getById(answerId));

    STORE_write(d => {
      STORE_ensureShape(d);
      const list = (d.itemsByAnswer[answerId] = d.itemsByAnswer[answerId] || []);
      if (!list.some(h => h.id === enriched.id)) list.push(enriched);
      return d;
    });
  };

  /* ───────────────────────────── ♻️ Restore one message ───────────────────────────── */
  const HL_restoreMessage = (msgEl) => {
    if (!msgEl) return;
    if (MSG_isSoftUnmounted(msgEl)) return;

    const answerId = MSG_getAnswerId(msgEl);
    const s = STORE_read();
    const list = s?.itemsByAnswer?.[answerId] || [];
    if (!list.length) { HL_emitInlineChanged(msgEl); return; }

    const existing = new Set(
      Array.from(msgEl.querySelectorAll(`.${CSS_CLS_HL}`)).map(el => el.getAttribute(ATTR_HL_ID))
    );

    for (const h of list) {
      if (!h || !h.anchors) continue;
      if (existing.has(h.id)) continue;

      const r = HL_resolveAnchors(h, msgEl);
      if (!r || r.collapsed) continue;

      const out = HL_wrapRange(r, h.color || CFG_DEFAULT_COLOR, answerId, h.id);
      if (out) existing.add(h.id);
    }

    HL_emitInlineChanged(msgEl);
  };

  /* ───────────────────────────── 🧰 Tools popup (middle-click) ───────────────────────────── */
  let STATE_toolsEl = null;
  let STATE_toolsTargetId = null;
  let STATE_toolsAnswerId = null;
  let STATE_toolsMode = 'single';
  let STATE_toolsCtx = null;
  let STATE_toolsBound = false;

  const HL_turnToAnswerId = (turnId, answerIdHint = '') => {
    const hint = String(answerIdHint || '').trim();
    if (hint) return hint;

    const key = String(turnId || '').trim();
    if (!key) return '';
    if (key.startsWith('turn:')) return key.slice(5).trim();

    try {
      const turn = TOPW?.H2O_MM_turnById?.get?.(key);
      const aid = String(turn?.answerId || turn?.primaryAId || '').trim();
      if (aid) return aid;
    } catch {}
    try {
      const entries = TOPW?.H2O_MM_turnIdByAId?.entries?.();
      if (entries) {
        for (const [aId, tId] of entries) {
          if (String(tId || '').trim() === key) return String(aId || '').trim();
        }
      }
    } catch {}
    return '';
  };

  const HL_findAnswerByTurn = (turnId, answerIdHint = '') => {
    const answerId = HL_turnToAnswerId(turnId, answerIdHint);
    if (answerId) {
      const direct = MSG_getById(answerId);
      if (direct) return { answerId, el: direct };
    }
    const key = String(turnId || '').trim();
    if (!key) return { answerId: answerId || '', el: null };
    const esc = UTIL_cssEsc(key);
    const byTurn =
      document.querySelector(`${SEL_ANSWER}[data-turn-id="${esc}"]`) ||
      document.querySelector(`[data-turn-id="${esc}"]`);
    const msg = byTurn ? (MSG_findContainer(byTurn) || byTurn) : null;
    return { answerId: answerId || MSG_getAnswerId(msg), el: msg || null };
  };

  async function HL_recolorTurnHighlights(turnId, fromColor, toColor, opts = {}) {
    const from = String(fromColor || '').trim().toLowerCase();
    const to = String(toColor || '').trim().toLowerCase();
    if (!from || !to || from === to) return { ok: false, changed: 0, reason: 'noop' };

    const resolved = HL_findAnswerByTurn(turnId, opts?.answerId || '');
    const answerId = String(resolved?.answerId || '').trim();
    if (!answerId) return { ok: false, changed: 0, reason: 'no-answer' };

    const msgEl = resolved?.el || MSG_getById(answerId);
    let changed = 0;
    const touchedIds = new Set();

    if (msgEl) {
      const marks = Array.from(msgEl.querySelectorAll(`.${CSS_CLS_HL}`));
      for (const mark of marks) {
        const color = String(
          mark.getAttribute(ATTR_HL_COLOR) ||
          mark.dataset?.highlightColor ||
          mark.dataset?.h2oInlineColor ||
          mark.dataset?.color ||
          ''
        ).trim().toLowerCase();
        if (color !== from) continue;
        HL_setMarkColor(mark, to);
        const id = String(mark.getAttribute(ATTR_HL_ID) || '').trim();
        if (id) touchedIds.add(id);
        changed += 1;
      }
    }

    if (changed > 0) {
      STORE_write(d => {
        STORE_ensureShape(d);
        const list = d?.itemsByAnswer?.[answerId] || [];
        for (const item of list) {
          const id = String(item?.id || '').trim();
          if (!id) continue;
          if (touchedIds.size ? touchedIds.has(id) : String(item?.color || '').trim().toLowerCase() === from) {
            item.color = to;
          }
        }
        return d;
      });
    } else {
      STORE_write(d => {
        STORE_ensureShape(d);
        const list = d?.itemsByAnswer?.[answerId] || [];
        for (const item of list) {
          if (String(item?.color || '').trim().toLowerCase() === from) {
            item.color = to;
            changed += 1;
          }
        }
        return d;
      });
      if (changed > 0 && msgEl) HL_restoreMessage(msgEl);
    }

    if (changed > 0) {
      try { await UTIL_storage.saveNow(); } catch {}
      HL_notifyChanged(answerId);
      HL_emitInlineChanged(msgEl || answerId);
      try { W.syncMiniMapDot?.(answerId, STORE_colorsFrom(answerId), { persist: true }); } catch {}
    }
    return { ok: true, changed, answerId, turnId: String(turnId || '').trim(), from, to };
  }

  const UI_toolsEnsure = () => {
    if (STATE_toolsEl) return STATE_toolsEl;

    const el = document.createElement('div');
    STATE_toolsEl = el;

    // ✅ cgxui class
    el.className = CSS_CLS_TOOLS;

    // ✅ cgxui ownership + ui tags
    el.setAttribute(ATTR_CGX_OWNER, SkID);
    el.setAttribute(ATTR_CGX_UI, CGX_UI_TOOLS);
    el.setAttribute(ATTR_CGX_STATE, 'hidden');

    el.innerHTML = `
      <div class="${CSS_CLS_SWATCH_WRAP}" ${ATTR_CGX_OWNER}="${SkID}" ${ATTR_CGX_UI}="${SkID}-swatches">
        ${PALETTE.map(p =>
          `<button class="${CSS_CLS_SWATCH}" ${ATTR_CGX_OWNER}="${SkID}" ${ATTR_CGX_UI}="${CGX_UI_SWATCH}" data-color="${p.title}" title="${p.title}" style="--swatch:${p.color}"></button>`
        ).join('')}
      </div>
    `;

    document.body.appendChild(el);

    if (!STATE_toolsBound) {
      STATE_toolsBound = true;

      UTIL_on(el, 'click', (e) => {
        e.stopPropagation();
        if (!STATE_toolsAnswerId) return;

        const sw = e.target.closest?.(`.${CSS_CLS_SWATCH}`);
        if (!sw) return;

        const colorName = String(sw.dataset.color || '').trim().toLowerCase();
        if (!colorName) return;

        if (STATE_toolsMode === 'bulk-recolor') {
          const ctx = STATE_toolsCtx || {};
          const sourceColor = String(ctx.sourceColor || '').trim().toLowerCase();
          if (!sourceColor || sourceColor === colorName) {
            UI_toolsHide();
            return;
          }
          HL_recolorTurnHighlights(ctx.turnId, sourceColor, colorName, { answerId: ctx.answerId })
            .catch((err) => { if (CFG_DEBUG) console.warn(`[H2O.${MODTAG}] bulk recolor failed`, err); });
          UI_toolsHide();
          return;
        }
        if (!STATE_toolsTargetId) return;

        let msgEl = MSG_getById(STATE_toolsAnswerId);
        const currentEl = document.querySelector(`.${CSS_CLS_HL}[${ATTR_HL_ID}="${UTIL_cssEsc(STATE_toolsTargetId)}"]`);
        const currentColor = currentEl?.getAttribute(ATTR_HL_COLOR);

        if (!msgEl && currentEl) msgEl = MSG_findContainer(currentEl);

        // Toggle off if same color clicked again
        if (currentColor === colorName) {
          HL_unwrapById(STATE_toolsTargetId, msgEl);
          HL_removeStoreItem(STATE_toolsAnswerId, STATE_toolsTargetId);
          UI_toolsHide();
          HL_notifyChanged(STATE_toolsAnswerId);
          HL_emitInlineChanged(msgEl || STATE_toolsAnswerId);
          return;
        }

        // Recolor
        document.querySelectorAll(`.${CSS_CLS_HL}[${ATTR_HL_ID}="${UTIL_cssEsc(STATE_toolsTargetId)}"]`)
          .forEach(node => HL_setMarkColor(node, colorName));

        HL_updateStoreColor(STATE_toolsAnswerId, STATE_toolsTargetId, colorName);
        UI_toolsHide();
        HL_notifyChanged(STATE_toolsAnswerId);
        HL_emitInlineChanged(msgEl || STATE_toolsAnswerId);
      }, true);

      UTIL_on(document, 'mousedown', (e) => {
        if (!STATE_toolsEl || STATE_toolsEl.style.pointerEvents !== 'auto') return;

        // don't close when middle-clicking a highlight (open/reposition trigger)
        if (e.button === 1 && e.target?.closest?.(`.${CSS_CLS_HL}`)) return;

        if (!STATE_toolsEl.contains(e.target)) UI_toolsHide();
      }, true);

      UTIL_on(document, 'keydown', (e) => { if (e.key === 'Escape') UI_toolsHide(); }, true);
      UTIL_on(window, 'scroll', UI_toolsHide, { passive: true });
      UTIL_on(window, 'resize', UI_toolsHide, { passive: true });
    }

    return el;
  };

  const UI_toolsPositionFor = (markEl) => {
    const rect = markEl.getBoundingClientRect();
    const t = UI_toolsEnsure();

    t.style.transform = 'translate(-9999px,-9999px)';
    t.style.opacity = '0';
    t.style.pointerEvents = 'none';
    t.setAttribute(ATTR_CGX_STATE, 'hidden');

    const marginY = 10;
    const panelWidth = t.offsetWidth || 180;
    const panelHeight = t.offsetHeight || 44;

    let x = rect.left + rect.width / 2 - panelWidth / 2;
    let y = rect.top - panelHeight - marginY;

    if (x + panelWidth > window.innerWidth - 8) x = window.innerWidth - panelWidth - 8;
    if (x < 8) x = 8;
    if (y < 8) y = rect.bottom + marginY;

    t.style.transform = `translate(${x}px, ${y}px)`;
    t.style.opacity = '1';
    t.style.pointerEvents = 'auto';
    t.setAttribute(ATTR_CGX_STATE, 'open');
  };

  const UI_toolsHide = () => {
    if (!STATE_toolsEl) return;
    STATE_toolsEl.style.opacity = '0';
    STATE_toolsEl.style.pointerEvents = 'none';
    STATE_toolsEl.setAttribute(ATTR_CGX_STATE, 'hidden');
    STATE_toolsTargetId = null;
    STATE_toolsAnswerId = null;
    STATE_toolsMode = 'single';
    STATE_toolsCtx = null;
  };

  const UI_toolsOpen = (ctx = {}) => {
    const modeRaw = String(ctx.mode || 'single').trim();
    const mode = (modeRaw === 'recolor-turn') ? 'bulk-recolor' : modeRaw;
    const answerId = String(ctx.answerId || '').trim();
    const turnId = String(ctx.turnId || '').trim();
    const sourceColor = String(ctx.sourceColor || '').trim().toLowerCase();
    const targetId = String(ctx.highlightId || '').trim();

    if (mode === 'bulk-recolor') {
      const resolvedAnswerId = HL_turnToAnswerId(turnId, answerId);
      if (!resolvedAnswerId || !sourceColor) return false;
      STATE_toolsMode = 'bulk-recolor';
      STATE_toolsCtx = { mode, turnId, answerId: resolvedAnswerId, sourceColor };
      STATE_toolsAnswerId = resolvedAnswerId;
      STATE_toolsTargetId = null;

      const t = UI_toolsEnsure();
      t.style.transform = 'translate(-9999px,-9999px)';
      t.style.opacity = '0';
      t.style.pointerEvents = 'none';
      t.setAttribute(ATTR_CGX_STATE, 'hidden');

      const panelWidth = t.offsetWidth || 180;
      const panelHeight = t.offsetHeight || 44;
      const anchorRect = ctx.anchorRect || null;
      const margin = 8;
      const xBase = Number.isFinite(ctx.leftAnchorX)
        ? ctx.leftAnchorX
        : (anchorRect ? (anchorRect.left || 0) : Number(ctx.clientX || 0));
      const yBase = anchorRect
        ? (anchorRect.top || 0) + ((anchorRect.height || 0) / 2)
        : Number(ctx.clientY || 0);

      let x = Math.round(xBase - panelWidth - margin);
      let y = Math.round(yBase - (panelHeight / 2));
      if (x + panelWidth > window.innerWidth - 8) x = window.innerWidth - panelWidth - 8;
      if (x < 8) x = 8;
      if (y + panelHeight > window.innerHeight - 8) y = window.innerHeight - panelHeight - 8;
      if (y < 8) y = 8;

      t.style.transform = `translate(${x}px, ${y}px)`;
      t.style.opacity = '1';
      t.style.pointerEvents = 'auto';
      t.setAttribute(ATTR_CGX_STATE, 'open');
      return true;
    }

    if (!targetId || !answerId) return false;
    const markEl = document.querySelector(`.${CSS_CLS_HL}[${ATTR_HL_ID}="${UTIL_cssEsc(targetId)}"]`);
    if (!markEl) return false;
    STATE_toolsMode = 'single';
    STATE_toolsCtx = { mode: 'single' };
    STATE_toolsTargetId = targetId;
    STATE_toolsAnswerId = answerId;
    UI_toolsPositionFor(markEl);
    return true;
  };

  // Hover disabled (kept for compatibility)
  const UI_onMouseEnterMark = () => {};

  /* ───────────────────────────── ✍️ Selection → highlight ───────────────────────────── */
  const STATE_unstableRetries = new WeakMap(); // Element -> count

  const HL_doSelection = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const raw = sel.getRangeAt(0);
    if (raw.collapsed) return;

    const msgEl = MSG_findContainer(raw.commonAncestorContainer);
    const answerId = MSG_getAnswerId(msgEl);
    if (!msgEl || !answerId) return;

    const range = HL_constrainToAncestor(raw, msgEl);
    if (!range) return;

    const colorTitle = STORE_getCurrentColor() || CFG_DEFAULT_COLOR;

    // 1) recolor intersecting marks
    const touched = [];
    const walker = document.createTreeWalker(msgEl, NodeFilter.SHOW_ELEMENT, {
      acceptNode(el) {
        if (!el.classList?.contains(CSS_CLS_HL)) return NodeFilter.FILTER_REJECT;
        const r = new Range(); r.selectNodeContents(el);
        const hit = !(range.compareBoundaryPoints(Range.END_TO_START, r) <= 0 ||
                      range.compareBoundaryPoints(Range.START_TO_END, r) >= 0);
        return hit ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    let node;
    while ((node = walker.nextNode())) {
      HL_setMarkColor(node, colorTitle);
      HL_updateStoreColor(answerId, node.getAttribute(ATTR_HL_ID), colorTitle);
      touched.push(node);
    }

    // 2) new highlight if none touched
    if (!touched.length) {
      const xpath = XP_rangeToSerializable(range, msgEl);
      const textPos = TXT_rangeToPos(range, msgEl);
      const textQuote = TXT_rangeToQuote(range, msgEl, 32);
      const wrapped = HL_wrapRange(range, colorTitle, answerId);

      if (wrapped?.id) {
        const pairNo = MSG_getPairNoFromEl(msgEl);

        HL_save(answerId, {
          id: wrapped.id,
          color: colorTitle,
          anchors: { xpath, textPos, textQuote },
          ts: Date.now(),
          pairNo
        });
      }
    }

    sel.removeAllRanges();
    UI_toolsHide();
    HL_notifyChanged(answerId);
    HL_emitInlineChanged(msgEl);
  };

  /* ───────────────────────────── 🎨 Styles (cgxui only) ───────────────────────────── */
  const UI_injectStyles = () => {
    if (document.getElementById(CSS_STYLE_ID)) return;

    const css = `
mark.${CSS_CLS_HL}{
  --hl-color: var(--hl-color, #FFD54F);
  --hl-strength: 0.46;
  background-color: color-mix(in srgb, var(--hl-color) calc(var(--hl-strength) * 100%), transparent) !important;
  color: inherit !important;

  border-radius: 2px;
  padding: 0 1px;
  box-shadow: none;

  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  line-height: inherit;
  text-decoration: none !important;
  outline: none;
  display: inline;

  transition: background-color .15s ease, opacity .12s ease;
}

mark.${CSS_CLS_HL} + mark.${CSS_CLS_HL}{
  margin-left: -1px;
}

mark.${CSS_CLS_HL}:hover{
  background-color: color-mix(in srgb, var(--hl-color) 58%, transparent) !important;
}

/* Tools panel (was .cgxui-hl-tools) */
.${CSS_CLS_TOOLS}[${ATTR_CGX_OWNER}="${SkID}"]{
  position: fixed;
  top: 0; left: 0;
  transform: translate(-9999px, -9999px);

  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;

  width: auto;
  height: auto;

  padding: 7px;
  margin: 0;

  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 7px;

  background: rgba(70,70,70,0.85);
  backdrop-filter: blur(8px) saturate(60%);
  -webkit-backdrop-filter: blur(8px);

  box-shadow: 0 4px 12px rgba(0,0,0,0.45);

  opacity: 0;
  pointer-events: none;
  transition: opacity .15s ease;
  z-index: 99999;
}

.${CSS_CLS_SWATCH_WRAP}[${ATTR_CGX_OWNER}="${SkID}"]{
  display: grid;
  grid-template-columns: repeat(4, auto);
  gap: 4px;
  padding: 0;
  margin: 0;
}

.${CSS_CLS_SWATCH}[${ATTR_CGX_OWNER}="${SkID}"]{
  all: unset;
  box-sizing: border-box;

  width: 16px;
  height: 8px;
  border-radius: 2px;

  background: color-mix(in srgb, var(--swatch) 70%, #1a1a1a);
  cursor: pointer;
  opacity: 0.95;
  transition: transform .12s ease, box-shadow .12s ease;
}

.${CSS_CLS_SWATCH}[${ATTR_CGX_OWNER}="${SkID}"]:hover{
  opacity: 1;
  transform: scale(1.12);
  box-shadow: 0 0 4px color-mix(in srgb, var(--swatch) 40%, transparent);
}
    `;

    const s = document.createElement('style');
    s.id = CSS_STYLE_ID;
    s.setAttribute(ATTR_CGX_OWNER, SkID);
    s.textContent = css;
    document.head.appendChild(s);

    MOD._styleEl = s;
  };

  /* ───────────────────────────── 🧭 Restore scheduler (SPA) ───────────────────────────── */
  let STATE_urlSig = location.pathname + location.search;
  const STATE_restoreTimers = new Map();
  const STATE_stabilizeTs = new Map();
  const STATE_lastTextHash = new Map();

  const REST_scheduleFor = (el) => {
    if (!el) return;

    if (MSG_isSoftUnmounted(el)) {
      const n = (STATE_unstableRetries.get(el) || 0) + 1;
      STATE_unstableRetries.set(el, n);
      if (n <= CFG_UNSTABLE_RETRY_MAX) UTIL_setTimeout(() => REST_scheduleFor(el), 250 + n * 50);
      return;
    }

    const id = MSG_getAnswerId(el);

    if (MSG_isUnstableAnswerId(id)) {
      const n = (STATE_unstableRetries.get(el) || 0) + 1;
      STATE_unstableRetries.set(el, n);
      if (n <= CFG_UNSTABLE_RETRY_MAX) UTIL_setTimeout(() => REST_scheduleFor(el), CFG_UNSTABLE_RETRY_BASE_MS + n * CFG_UNSTABLE_RETRY_STEP_MS);
      return;
    }

    STATE_unstableRetries.delete(el);

    clearTimeout(STATE_restoreTimers.get(id));
    STATE_restoreTimers.set(id, setTimeout(() => REST_tryWhenStable(el, id), CFG_RESTORE_DEBOUNCE_MS));
  };

  const REST_tryWhenStable = (el, id) => {
    const t = UTIL_textOf(el);
    const h = UTIL_hashText(t);
    const last = STATE_lastTextHash.get(id);
    const now = performance.now();
    const lastTs = STATE_stabilizeTs.get(id) || 0;

    if (h !== last || (now - lastTs) < CFG_STABLE_WINDOW_MS) {
      STATE_lastTextHash.set(id, h);
      STATE_stabilizeTs.set(id, now);
      STATE_restoreTimers.set(id, setTimeout(() => REST_tryWhenStable(el, id), CFG_STABLE_WINDOW_MS));
      return;
    }

    HL_restoreMessage(el);
  };

  const REST_allStable = (reason = 'initial') => {
    const start = performance.now();
    const MAX_WAIT_MS = CFG_REFRESH_STABLE_MAX_WAIT_MS;
    const NEED_STABLE_FRAMES = CFG_REFRESH_STABLE_FRAMES;

    let lastSig = '';
    let stableFrames = 0;

    const makeSig = (nodes) => {
      const a = nodes.slice(0, 3).map(n => MSG_getAnswerId(n)).join(',');
      const b = nodes.slice(-3).map(n => MSG_getAnswerId(n)).join(',');
      return `${nodes.length}|${a}|${b}`;
    };

    const tick = () => {
      const nodes = Array.from(document.querySelectorAll(SEL_MSG));
      if (!nodes.length) {
        if ((performance.now() - start) < MAX_WAIT_MS) return requestAnimationFrame(tick);
        return;
      }

      const ok = nodes.every(n => n && n.isConnected && !MSG_isSoftUnmounted(n) && !MSG_isUnstableAnswerId(MSG_getAnswerId(n)));
      const sig = makeSig(nodes);

      if (ok && sig === lastSig) stableFrames++;
      else stableFrames = 0;

      lastSig = sig;

      if (stableFrames >= NEED_STABLE_FRAMES) {
        nodes.forEach(REST_scheduleFor);
        return;
      }

      if ((performance.now() - start) < MAX_WAIT_MS) return requestAnimationFrame(tick);

      nodes.forEach(REST_scheduleFor);
    };

    requestAnimationFrame(tick);
  };

  /* ───────────────────────────── 🔭 Observers + navigation patch ───────────────────────────── */
  let STATE_mo = null;
  let STATE_historyPS = null;
  let STATE_historyRS = null;

  const OBS_observeMessages = () => {
    const root = document.querySelector(SEL_MAIN) || document.body;

    const mo = new MutationObserver(muts => {
      const touched = new Set();

      for (const m of muts) {
        const target = m.target;

        if (target instanceof Element && target.matches?.(SEL_MSG) && !MSG_isSoftUnmounted(target)) {
          touched.add(target);
        }

        if (m.type === 'attributes' && target instanceof Element && target.matches?.(SEL_MSG)) {
          touched.add(target);
        }

        if (m.addedNodes && m.addedNodes.length) {
          m.addedNodes.forEach(n => {
            if (!(n instanceof Element)) return;

            if (n.matches?.(SEL_MSG) && !MSG_isSoftUnmounted(n)) touched.add(n);

            n.querySelectorAll?.(SEL_MSG).forEach(el => {
              if (!MSG_isSoftUnmounted(el)) touched.add(el);
            });
          });
        }
      }

      touched.forEach(REST_scheduleFor);
    });

    mo.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-cgxui-unmounted', 'data-message-id', 'data-cgxui-uid', 'data-testid', 'id']
    });

    document.querySelectorAll(SEL_MSG).forEach(el => { if (!MSG_isSoftUnmounted(el)) REST_scheduleFor(el); });

    STATE_mo = mo;
  };

  const OBS_hookNavigation = () => {
    const navEvent = () => {
      const sig = location.pathname + location.search;
      if (sig !== STATE_urlSig) {
        STATE_urlSig = sig;
        setTimeout(() => document.querySelectorAll(SEL_MSG).forEach(REST_scheduleFor), 200);
      }
    };

    STATE_historyPS = history.pushState;
    STATE_historyRS = history.replaceState;

    history.pushState = function (...a) { STATE_historyPS.apply(this, a); navEvent(); };
    history.replaceState = function (...a) { STATE_historyRS.apply(this, a); navEvent(); };

    UTIL_on(window, 'popstate', navEvent);
  };

  const OBS_unhookNavigation = () => {
    try { if (STATE_historyPS) history.pushState = STATE_historyPS; } catch {}
    try { if (STATE_historyRS) history.replaceState = STATE_historyRS; } catch {}
    STATE_historyPS = null;
    STATE_historyRS = null;
  };

  const UTIL_whenReady = (selector, cb, timeout = 10000) => {
    const start = performance.now();
    (function check() {
      const el = document.querySelector(selector);
      if (el) return cb(el);
      if (performance.now() - start < timeout) return setTimeout(check, 200);
      console.warn(`[H2O.${MODTAG}] whenReady timeout`, selector);
    })();
  };

  /* ───────────────────────────── 🧠 MiniMap prime from store (colors only) ───────────────────────────── */
  const MM_primeFromStore = () => {
    try {
      const store = STORE_read() || {};
      STORE_ensureShape(store);

      const itemsByAnswer = store.itemsByAnswer || {};
      for (const [answerId, list] of Object.entries(itemsByAnswer)) {
        if (!Array.isArray(list) || !list.length) continue;

        const hex = list.map(h => (PAL_colorDef(h.color)?.color) || '').filter(Boolean);
        const colors = Array.from(new Set(hex));
        if (!colors.length) continue;

        const detail = { answerId, colors, source: 'highlighter:prime', ts: Date.now() };

        if (H2O?.events?.emit) H2O.events.emit(EV_BUS_INLINE_CHANGED, detail);
        else {
          try { W.dispatchEvent(new CustomEvent(EV_DOM_CGXUI_INLINE_CHANGED,  { detail, bubbles: true, composed: true })); } catch {}
          try { W.dispatchEvent(new CustomEvent(EV_DOM_H2O_INLINE_CHANGED, { detail, bubbles: true, composed: true })); } catch {}
          try { W.dispatchEvent(new CustomEvent(`evt:h2o:inline:changed`, { detail, bubbles: true, composed: true })); } catch {}
          try { W.dispatchEvent(new CustomEvent(`h2o-inline:changed`, { detail, bubbles: true, composed: true })); } catch {}
        }

        if (typeof window.syncMiniMapDot === 'function') {
          window.syncMiniMapDot(answerId, colors, { persist: true });
        }
      }
    } catch (err) {
      console.warn(`[H2O.${MODTAG}] primeFromStore failed`, err);
    }
  };

  /* ───────────────────────────── ⌨️ Keyboard ───────────────────────────── */
  const KEY_onKeyDown = (e) => {
    if (!STATE.enabled) return;

    const needMeta = UTIL_isMac();
    const metaOk = (needMeta && e.metaKey && !e.ctrlKey) || (!needMeta && e.ctrlKey && !e.metaKey);
    if (!metaOk || e.altKey || e.shiftKey) return;

    if (e.code === KEY_HIGHLIGHT) {
      e.preventDefault();
      HL_doSelection();
      return;
    }

    if (e.code === KEY_CYCLE) {
      e.preventDefault();
      const next = PAL_nextName(STORE_getCurrentColor());
      STORE_setCurrentColor(next);
      HL_notifyChanged(null);
    }
  };

  /* ───────────────────────────── 📚 listEntries + clearAll (public API) ───────────────────────────── */
  const API_listEntries = (options = {}) => {
    const {
      includeEmptyText = false,
      maxTextLen = 200,
      maxContextLen = 260
    } = options;

    const store = STORE_read() || {};
    STORE_ensureShape(store);

    const currentConvoId = store.convoId || UTIL_getConvoKey();
    const itemsByAnswer = store.itemsByAnswer || {};

    const msgs = Array.from(document.querySelectorAll(SEL_MSG));
    const indexByAnswerId = new Map();
    msgs.forEach((el, idx) => {
      const id = MSG_getAnswerId(el);
      if (id) indexByAnswerId.set(id, idx);
    });

    const entries = [];

    for (const [answerId, list] of Object.entries(itemsByAnswer)) {
      if (!Array.isArray(list) || !list.length) continue;

      const msgEl = MSG_getById(answerId) || MSG_findContainer(document.querySelector(`[data-message-id="${answerId}"]`));
      const answerIndex = indexByAnswerId.get(answerId) ?? -1;
      const role = msgEl?.getAttribute?.('data-message-author-role') || 'assistant';

      for (const h of list) {
        if (!h || !h.id) continue;

        if (h.convoId && h.convoId !== currentConvoId) continue;
        if (!h.convoId && !msgEl) continue;

        const hlId = h.id;
        let text = '';
        let context = '';
        let range = null;

        if (msgEl) {
          const marks = msgEl.querySelectorAll(`mark.${CSS_CLS_HL}[${ATTR_HL_ID}="${UTIL_cssEsc(hlId)}"]`);
          if (marks.length) {
            const rr = document.createRange();
            rr.setStartBefore(marks[0]);
            rr.setEndAfter(marks[marks.length - 1]);
            text = (rr.toString() || '').replace(/\s+/g, ' ').trim();
          }

          if (!text) {
            range = HL_resolveAnchors(h, msgEl);
            if (range && !range.collapsed) text = (range.toString() || '').replace(/\s+/g, ' ').trim();
          }
        }

        if (!text && h.anchors?.textQuote?.exact) {
          text = (h.anchors.textQuote.exact || '').replace(/\s+/g, ' ').trim();
        }

        if (!text && !includeEmptyText) continue;

        const fullText = text;
        if (text.length > maxTextLen) text = text.slice(0, maxTextLen).trimEnd() + '…';

        if (h.anchors?.textQuote) {
          const tq = h.anchors.textQuote;
          const pre = (tq.prefix || '').replace(/\s+/g, ' ').trim();
          const suf = (tq.suffix || '').replace(/\s+/g, ' ').trim();
          context = [pre, fullText, suf].filter(Boolean).join(' … ');
          if (context.length > maxContextLen) context = context.slice(0, maxContextLen).trimEnd() + '…';
        } else {
          context = text;
        }

        const colorName = h.color || CFG_DEFAULT_COLOR;
        const def = PAL_colorDef(colorName);
        const colorHex = def?.color || PAL_colorDef(CFG_DEFAULT_COLOR).color;

        entries.push({
          convoId: h.convoId || currentConvoId,
          answerId,
          hlId,
          colorName,
          colorHex,
          text,
          context,
          role,
          answerIndex,
          pairNo: h.pairNo ?? null,
          createdAt: h.ts || 0,
          anchors: h.anchors || {}
        });
      }
    }

    entries.sort((a, b) => {
      if (a.answerIndex !== b.answerIndex) return a.answerIndex - b.answerIndex;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });

    return entries;
  };

  const API_clearAll = async () => {
    try {
      UTIL_storage.writeSync(() => ({}));
      await UTIL_storage.saveNow();
    } catch (err) {
      if (CFG_DEBUG) console.warn(`[H2O.${MODTAG}] clearAll failed`, err);
    }
  };

  /* ───────────────────────────── 🌐 Public API (canonical + legacy mirrors) ───────────────────────────── */
  const API = {
    getStore: () => STORE_read(),
    hasHighlights: (answerId) => {
      const s = STORE_read() || {};
      return !!(s.itemsByAnswer && s.itemsByAnswer[answerId]?.length);
    },
    listEntries: (options) => API_listEntries(options || {}),
    clearAll: API_clearAll,
    openPopup: (ctx = {}) => UI_toolsOpen(ctx),
    recolorTurnHighlights: (turnId, fromColor, toColor, opts = {}) => HL_recolorTurnHighlights(turnId, fromColor, toColor, opts),
    setCurrentColor: STORE_setCurrentColor,
    getCurrentColor: STORE_getCurrentColor,
    setEnabled: (on) => { STATE.enabled = !!on; log('setEnabled', STATE.enabled); },
    getEnabled: () => STATE.enabled,
    dispose: () => CORE_dispose()
  };

  MOD.api = API;
  H2O.inline = API;
  W.H2OInline = API;
  TOPW.H2O_HL = TOPW.H2O_HL || {};
  TOPW.H2O_HL.openPopup = (ctx = {}) => API.openPopup(ctx);
  TOPW.H2O_HL.recolorTurnHighlights = (turnId, fromColor, toColor, opts = {}) =>
    API.recolorTurnHighlights(turnId, fromColor, toColor, opts);

  if (typeof W.listAllEntries !== 'function') W.listAllEntries = function listAllEntriesLegacy() { return []; };
  W.listAllEntries = (...a) => API.listEntries(...a);

  /* ───────────────────────────── 🧩 Control Hub registration (legacy bridge) ───────────────────────────── */
  const BRIDGE_registerControlHub = () => {
    try {
      W.h2oConfig = W.h2oConfig || {};
      W.h2oConfig.features = W.h2oConfig.features || {};

      W.h2oConfig.features.highlighter = {
        key: 'highlighter',
        label: 'Inline Highlighter',
        description: 'Cmd/Ctrl+1 highlight, Cmd/Ctrl+2 cycle colors with MiniMap dots',
        enabled() { return STATE.enabled; },
        setEnabled(on) { STATE.enabled = !!on; console.log('[ControlHub→Highlighter] setEnabled:', STATE.enabled ? 'ON' : 'OFF'); }
      };
    } catch (e) {
      console.warn(`[H2O.${MODTAG}] ControlHub registration failed`, e);
    }
  };

  /* ───────────────────────────── 🧯 Restore hooks (remount) ───────────────────────────── */
  const BRIDGE_bindRemountOnce = () => {
    const FLAG = `H2O:${CID}:REMOUNT:BOUND`;
    if (W[FLAG]) return;
    W[FLAG] = 1;

    UTIL_on(W, EV_DOM_CGXUI_MSG_REMOUNTED, (ev) => {
      const uid = ev?.detail?.id;
      if (!uid) return;
      const msg = document.querySelector(`[data-cgxui-uid="${UTIL_cssEsc(uid)}"]`);
      if (!msg) return;
      REST_scheduleFor(msg);
    }, true);
  };

  /* ───────────────────────────── 🖱️ Middle click to open palette ───────────────────────────── */
  const UI_bindMiddleClick = () => {
    UTIL_on(document, 'mousedown', (e) => {
      if (e.button !== 1) return;
      const el = e.target?.closest?.(`.${CSS_CLS_HL}`);
      if (!el) return;

      e.preventDefault();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      e.stopPropagation();

      STATE_toolsMode = 'single';
      STATE_toolsCtx = { mode: 'single' };
      STATE_toolsTargetId = el.getAttribute(ATTR_HL_ID);
      STATE_toolsAnswerId = el.getAttribute(ATTR_ANSWER_ID) || MSG_getAnswerId(MSG_findContainer(el));
      UI_toolsPositionFor(el);
    }, true);
  };

  /* ───────────────────────────── 🚀 CORE lifecycle ───────────────────────────── */
  async function CORE_boot() {
    if (STATE.booted) return;
    STATE.booted = true;

    DIAG.bootCount += 1;
    DIAG.lastBootAt = Date.now();
    DIAG_step('boot');

    try {
      await UTIL_storage.init();
      await MIG_disk_legacy_to_canon_once();

      STORE_write(d => { STORE_ensureShape(d); d.convoId = UTIL_getConvoKey(); return d; });

      UI_injectStyles();
      BRIDGE_registerControlHub();

      MM_primeFromStore();

      OBS_hookNavigation();
      OBS_observeMessages();

      try {
        const s0 = STORE_read() || {};
        const m0 = s0.itemsByAnswer || {};
        const hasAny = Object.keys(m0).some(k => Array.isArray(m0[k]) && m0[k].length);
        if (hasAny) {
          UTIL_setTimeout(() => REST_allStable('delayed-1'), 1200);
          UTIL_setTimeout(() => REST_allStable('delayed-2'), 3200);
        }
      } catch (e) {
        console.warn(`[H2O.${MODTAG}] delayed restore skipped`, e);
      }

      UTIL_whenReady(`${SEL_MSG}, .prose, ${SEL_MAIN}`, () => REST_allStable('first-pass'));

      BRIDGE_bindRemountOnce();

      UTIL_on(document, 'keydown', KEY_onKeyDown, true);
      UTIL_on(document, 'mouseover', UI_onMouseEnterMark, true);
      UI_bindMiddleClick();

      UTIL_on(document, 'scroll', UI_toolsHide, true);
      UTIL_on(window, 'resize', UI_toolsHide, true);

      log(`InlineHighlighter v3.1.0 loaded ✅ (cgxui CSS)`);
    } catch (err) {
      DIAG_fail(err);
      console.error(`[H2O.${MODTAG}] boot crash`, err);
    }
  }

  function CORE_dispose() {
    DIAG.disposedCount += 1;
    DIAG.lastDisposeAt = Date.now();
    DIAG_step('dispose');

    try { UI_toolsHide(); } catch {}
    try { STATE_mo?.disconnect?.(); } catch {}
    STATE_mo = null;

    try { OBS_unhookNavigation(); } catch {}

    try { UTIL_storage.dispose(); } catch {}

    try { UTIL_offAll(); } catch {}
    try { UTIL_clearAllTimers(); } catch {}

    try { MOD._styleEl?.remove?.(); } catch {}
    MOD._styleEl = null;

    try { STATE_toolsEl?.remove?.(); } catch {}
    STATE_toolsEl = null;

    STATE.booted = false;
    STATE.installed = false;
  }

  MOD.boot = CORE_boot;
  MOD.dispose = CORE_dispose;

  // auto-start
  CORE_boot();
})();
