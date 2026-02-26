// ==UserScript==
// @name         4F.🟢🖋️Notes Engine🖋️
// @namespace    H2O.Prime.CGX.NotesEngine
// @version      2.1.0
// @description  Per-chat Notes store + Scratchpad. Exposes window.H2ONotes API. Emits h2o-notes:changed (+ legacy ho-notes:changed). Contract v2 Stage 1 aligned.
// @match        https://chatgpt.com/*
// @author       HumamDev
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  /* ============================================================================
   * 💧 H2O — Notes Engine (Contract v2, Stage 1: Foundation / Mechanics)
   * - Identity-first + bounded DIAG
   * - No raw strings in logic: KEY_/EV_/SEL_/CSS_/CFG_/ATTR_/NS_/STR_
   * - boot/dispose idempotent + full cleanup
   * - Per-chat: notes[] + scratch text in localStorage
   * - Public API: window.H2ONotes (+ legacy alias window.HoNotes)
   * - ✅ UI/CSS: none here; no ho-* UI hooks to migrate
   * ========================================================================== */

  /* ───────────────────────────── 0) Identity (Contract) ───────────────────────────── */

  /** @core Identity + namespace anchors (mechanics only). */
  const TOK = 'NE';
  const PID = 'ntsngn';
  const CID = 'notese';
  const SkID = 'ntsng';

  const MODTAG = 'NotesE';
  const MODICON = '🗒️';
  const EMOJI_HDR = '🟢';

  const SUITE = 'prm';
  const HOST  = 'cgx';

  // ALIASES (readability only — NOT new identities)
  const DsID = PID; // Disk alias
  const BrID = PID; // Brain alias

  // for identifier names only
  const PID_UP = PID.toUpperCase();
  const CID_UP = CID.toUpperCase();

  /* ───────────────────────────── 0.1) Root Anchors ───────────────────────────── */

  /** @core Resolve window root (Tampermonkey safe). */
  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;

  /** @core Root H2O vault (bounded). */
  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || {};

  /** @core Module vault (Brain shelf). */
  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});
  VAULT.meta = VAULT.meta || { tok: TOK, pid: PID, cid: CID, skid: SkID, modtag: MODTAG, suite: SUITE, host: HOST };

  /* Optional ecosystem registries (MODE B: warn + keep first) */
  H2O.KEYS = H2O.KEYS || {};
  H2O.EV   = H2O.EV   || {};
  H2O.SEL  = H2O.SEL  || {};
  H2O.UI   = H2O.UI   || {};

  /* ───────────────────────────── 1) Contract Tokens ───────────────────────────── */

  const NS_DISK = `h2o:${SUITE}:${HOST}:${PID}:nt:root:v1`;

  const NS_GUARD = `${NS_DISK}:guard`;

  const KEY_NOTES_GUARD_BOOT     = `${NS_GUARD}:booted`;
  const KEY_NOTES_GUARD_MO       = `${NS_GUARD}:mo`;
  const KEY_NOTES_GUARD_NAV      = `${NS_GUARD}:navHook`;

  const NS_DISK_NOTES_PREFIX     = `h2o:${SUITE}:${HOST}:${PID}:store:notes:v1`;
  const NS_DISK_SCR_PREFIX       = `h2o:${SUITE}:${HOST}:${PID}:store:scratch:v1`;

  // Core bus topic (canonical) + DOM events (canonical + legacy)
  const EV_NOTES_CHANGED_TOPIC   = 'notes:changed';
  const EV_NOTES_CHANGED_CANON   = 'h2o-notes:changed';
  const EV_NOTES_CHANGED_LEG     = 'ho-notes:changed';

  const ATTR_NOTES = Object.freeze({
    marker: '__H2O_NOTES__',
  });

  const STR_NOTES = Object.freeze({
    unknown: 'unknown',
    chatPathRe: /\/c\/([a-z0-9-]+)/i,

    // API names
    apiName: 'H2ONotes',
    apiLegacy: 'HoNotes',

    // changed sources
    srcScratch: 'scratch',
    srcBoot: 'boot',
  });

  const CFG_NOTES = Object.freeze({
    tagsMax: 12,
    diagStepsMax: 120,
    moObserveSubtree: true,
    exportVersion: '2.0.1',
  });

  /* ───────────────────────────── 2) DIAG (bounded) ───────────────────────────── */

  /** @core DIAG state (bounded). */
  VAULT.diag = VAULT.diag || {
    ver: 'notes-v2',
    bootCount: 0,
    lastBootAt: 0,
    steps: [],
    lastError: null,
  };

  /** @helper Push a DIAG step (ring buffer). */
  function DIAG_NT_step(name, extra) {
    const d = VAULT.diag;
    d.steps.push({ t: Date.now(), name, extra: extra ?? null });
    if (d.steps.length > CFG_NOTES.diagStepsMax) d.steps.shift();
  }

  /** @helper Safe diag wrapper. */
  function DIAG_NT_safe(name, extra) { try { DIAG_NT_step(name, extra); } catch (_) {} }

  /* ───────────────────────────── 3) State (bounded) ───────────────────────────── */

  VAULT.state = VAULT.state || {
    booted: false,
    chatId: STR_NOTES.unknown,
    mo: null,
    onPop: null,
  };

  const S = VAULT.state;

  /* ───────────────────────────── 4) Helpers (Core-first safe fallbacks) ───────────────────────────── */

  /** @helper Get chatId (Core-first). */
  function UTIL_NT_getChatId() {
    const v = W.H2O?.util?.getChatId?.();
    if (v) return String(v);

    const m = String(location.pathname || '').match(STR_NOTES.chatPathRe);
    return m ? String(m[1]) : STR_NOTES.unknown;
  }

  /** @helper Safe parse JSON (Core-first). */
  function UTIL_NT_safeParseJSON(s, fallback) {
    if (typeof W.H2O?.util?.safeParse === 'function') return W.H2O.util.safeParse(s, fallback);
    try { return JSON.parse(s); } catch { return fallback; }
  }

  /** @helper Stable random id. */
  function UTIL_NT_cryptoId() {
    try { return crypto.randomUUID(); }
    catch { return `n_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
  }

  /** @helper Normalize tags array. */
  function UTIL_NT_normTags(tags) {
    if (!Array.isArray(tags)) return [];
    return tags
      .map(t => String(t || '').trim())
      .filter(Boolean)
      .slice(0, CFG_NOTES.tagsMax);
  }

  /** @helper Disk key builders (per chat). */
  function KEY_NT_notes(chatId)   { return `${NS_DISK_NOTES_PREFIX}:${String(chatId || STR_NOTES.unknown)}`; }
  function KEY_NT_scratch(chatId) { return `${NS_DISK_SCR_PREFIX}:${String(chatId || STR_NOTES.unknown)}`; }

  /* ───────────────────────────── 5) Events ───────────────────────────── */

  /** @helper Emit notes changed (Core-first, else DOM). */
  function CORE_NT_emitChanged(extra = null) {
    const detail = {
      chatId: S.chatId,
      ...(extra && typeof extra === 'object' ? extra : {}),
      [ATTR_NOTES.marker]: true,
    };

    // ✅ canonical first (Core bus)
    if (typeof W.H2O?.events?.emit === 'function') {
      try { W.H2O.events.emit(EV_NOTES_CHANGED_TOPIC, detail); } catch (_) {}
      return;
    }

    // fallback DOM events
    try { W.dispatchEvent(new CustomEvent(EV_NOTES_CHANGED_CANON, { detail })); } catch (_) {}
    try { W.dispatchEvent(new CustomEvent(EV_NOTES_CHANGED_LEG,   { detail })); } catch (_) {}
  }

  /* ───────────────────────────── 6) Store IO ───────────────────────────── */

  /** @helper Load notes array. */
  function STORE_NT_loadNotes() {
    const raw = localStorage.getItem(KEY_NT_notes(S.chatId));
    const v = UTIL_NT_safeParseJSON(raw, []);
    return Array.isArray(v) ? v : [];
  }

  /** @helper Save notes array. */
  function STORE_NT_saveNotes(arr) {
    try { localStorage.setItem(KEY_NT_notes(S.chatId), JSON.stringify(arr || [])); } catch (_) {}
  }

  /** @core Scratch get. */
  function STORE_NT_scratchGet() {
    try { return String(localStorage.getItem(KEY_NT_scratch(S.chatId)) || ''); }
    catch { return ''; }
  }

  /** @core Scratch set. */
  function STORE_NT_scratchSet(text) {
    try { localStorage.setItem(KEY_NT_scratch(S.chatId), String(text || '')); } catch (_) {}
    CORE_NT_emitChanged({ source: STR_NOTES.srcScratch });
  }

  /* ───────────────────────────── 7) Core Functions ───────────────────────────── */

  /** @core List notes (pinned first, then newest updated). */
  function API_NT_list() {
    const arr = STORE_NT_loadNotes();
    return arr.slice().sort((a, b) => {
      const ap = a?.pinned ? 0 : 1;
      const bp = b?.pinned ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return (b?.updatedAt || b?.createdAt || 0) - (a?.updatedAt || a?.createdAt || 0);
    });
  }

  /** @core Add note. */
  function API_NT_add(note) {
    const arr = STORE_NT_loadNotes();
    const now = Date.now();

    const n = {
      id: UTIL_NT_cryptoId(),
      type: String(note?.type || 'note'),
      title: String(note?.title || '').trim(),
      text: String(note?.text || '').trim(),
      tags: UTIL_NT_normTags(note?.tags),
      pinned: !!note?.pinned,
      createdAt: now,
      updatedAt: now,
      source: note?.source ? { ...note.source } : null,
    };

    if (!n.title && !n.text) return null;

    arr.unshift(n);
    STORE_NT_saveNotes(arr);
    CORE_NT_emitChanged();
    return n;
  }

  /** @core Update note by id. */
  function API_NT_update(id, patch) {
    if (!id) return false;
    const arr = STORE_NT_loadNotes();
    const i = arr.findIndex(x => x && x.id === id);
    if (i < 0) return false;

    const now = Date.now();
    const cur = arr[i];

    arr[i] = {
      ...cur,
      ...(patch || {}),
      title:  (patch?.title  != null) ? String(patch.title).trim() : cur.title,
      text:   (patch?.text   != null) ? String(patch.text).trim()  : cur.text,
      tags:   (patch?.tags   != null) ? UTIL_NT_normTags(patch.tags) : cur.tags,
      pinned: (patch?.pinned != null) ? !!patch.pinned : cur.pinned,
      source: (patch?.source != null) ? (patch.source ? { ...patch.source } : null) : cur.source,
      updatedAt: now,
    };

    STORE_NT_saveNotes(arr);
    CORE_NT_emitChanged();
    return true;
  }

  /** @core Remove note by id. */
  function API_NT_remove(id) {
    if (!id) return false;
    const arr = STORE_NT_loadNotes();
    const next = arr.filter(x => x && x.id !== id);
    if (next.length === arr.length) return false;
    STORE_NT_saveNotes(next);
    CORE_NT_emitChanged();
    return true;
  }

  /** @core Toggle pin by id. */
  function API_NT_togglePin(id) {
    const arr = STORE_NT_loadNotes();
    const i = arr.findIndex(x => x && x.id === id);
    if (i < 0) return false;
    arr[i].pinned = !arr[i].pinned;
    arr[i].updatedAt = Date.now();
    STORE_NT_saveNotes(arr);
    CORE_NT_emitChanged();
    return true;
  }

  /** @core Clear all notes. */
  function API_NT_clearAll() {
    STORE_NT_saveNotes([]);
    CORE_NT_emitChanged();
  }

  /** @core Export JSON payload. */
  function API_NT_exportJSON() {
    const payload = {
      chatId: S.chatId,
      scratch: STORE_NT_scratchGet(),
      notes: STORE_NT_loadNotes(),
      exportedAt: Date.now(),
      version: CFG_NOTES.exportVersion,
    };
    return JSON.stringify(payload, null, 2);
  }

  /* ───────────────────────────── 8) Public API (preserved) ───────────────────────────── */

  /** @core Install window APIs (canonical + legacy alias). */
  function CORE_NT_installPublicAPI() {
    W[STR_NOTES.apiName] = W[STR_NOTES.apiName] || {
      chatId: () => S.chatId,
      keyNotes: () => KEY_NT_notes(S.chatId),
      keyScratch: () => KEY_NT_scratch(S.chatId),

      list: API_NT_list,
      add: API_NT_add,
      update: API_NT_update,
      remove: API_NT_remove,
      togglePin: API_NT_togglePin,
      clear: API_NT_clearAll,

      scratchGet: STORE_NT_scratchGet,
      scratchSet: STORE_NT_scratchSet,

      exportJSON: API_NT_exportJSON,
    };

    // legacy alias
    W[STR_NOTES.apiLegacy] = W[STR_NOTES.apiLegacy] || W[STR_NOTES.apiName];
  }

  /* ───────────────────────────── 9) Navigation / Rebind ───────────────────────────── */

  /** @critical Rebind state if chatId changed. */
  function CORE_NT_rebindIfChatChanged() {
    const now = UTIL_NT_getChatId();
    if (now === S.chatId) return;
    S.chatId = now;
    CORE_NT_emitChanged();
    DIAG_NT_safe('chat:rebind', { chatId: S.chatId });
  }

  /** @core Install SPA listeners (popstate + light observer). */
  function CORE_NT_bindNav() {
    if (W[KEY_NOTES_GUARD_NAV]) return;
    W[KEY_NOTES_GUARD_NAV] = 1;

    S.onPop = () => CORE_NT_rebindIfChatChanged();
    W.addEventListener('popstate', S.onPop);

    if (W[KEY_NOTES_GUARD_MO]) return;
    W[KEY_NOTES_GUARD_MO] = 1;

    if (typeof MutationObserver !== 'function') return;
    S.mo = new MutationObserver(() => {
      CORE_NT_rebindIfChatChanged();
    });
    S.mo.observe(document.documentElement, { childList: true, subtree: CFG_NOTES.moObserveSubtree });
  }

  /* ───────────────────────────── 10) Boot / Dispose ───────────────────────────── */

  /** @core Boot (idempotent). */
  function CORE_NT_boot() {
    try {
      VAULT.diag.bootCount++;
      VAULT.diag.lastBootAt = Date.now();

      if (S.booted) return;
      S.booted = true;

      if (W[KEY_NOTES_GUARD_BOOT]) return;
      W[KEY_NOTES_GUARD_BOOT] = 1;

      S.chatId = UTIL_NT_getChatId();

      CORE_NT_installPublicAPI();
      CORE_NT_bindNav();

      CORE_NT_emitChanged({ source: STR_NOTES.srcBoot });
      DIAG_NT_safe('boot:done', { ok: true, chatId: S.chatId });

    } catch (err) {
      VAULT.diag.lastError = String(err?.stack || err);
      DIAG_NT_safe('boot:crash', VAULT.diag.lastError);
      throw err;
    }
  }

  /** @core Dispose (best-effort cleanup). */
  function CORE_NT_dispose() {
    try {
      if (S.onPop) W.removeEventListener('popstate', S.onPop);
      S.onPop = null;

      if (S.mo) { try { S.mo.disconnect(); } catch (_) {} S.mo = null; }

      DIAG_NT_safe('dispose:done', null);
    } catch (e) {
      DIAG_NT_safe('dispose:err', String(e?.stack || e));
    }
  }

  /* ───────────────────────────── 11) Public Module API (bounded) ───────────────────────────── */

  VAULT.api = VAULT.api || {};
  VAULT.api.boot = CORE_NT_boot;
  VAULT.api.dispose = CORE_NT_dispose;

  /* ───────────────────────────── 12) Start Gate ───────────────────────────── */

  CORE_NT_boot();

})();
