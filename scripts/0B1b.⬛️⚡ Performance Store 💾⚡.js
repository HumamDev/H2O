// ==UserScript==
// @h2o-id             0b1b.perf.store
// @name               0B1b.⬛️⚡ Performance Store 💾⚡
// @namespace          H2O.Premium.CGX.perf.store
// @author             HumamDev
// @version            2.0.0
// @revision           001
// @build              260326-000000
// @description        Profile storage for H2O Performance Governor: global/per-chat profile persistence, plan resolution, plan-map definitions.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* ============================================================================
   * 💧 H2O — Performance Store (Phase 1 MVP)
   * Pure data / storage module — no DOM, no UI, no events, no side-effects.
   * Registers on H2O.diet.store for Governor + Adapter consumers.
   * ========================================================================== */

  /* ─── 0) Identity ─────────────────────────────────────────────────────────── */

  const TOK    = 'PS';
  const PID    = 'dietstr';
  const CID    = 'perfstore';
  const SkID   = 'diet';
  const MODTAG = 'PerfStore';
  const SUITE  = 'prm';
  const HOST   = 'cgx';
  const BrID   = PID;

  const W   = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK]  = H2O[TOK] || {};
  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});
  VAULT.meta  = VAULT.meta || { tok: TOK, pid: PID, cid: CID, skid: SkID, modtag: MODTAG, suite: SUITE, host: HOST };

  /* ─── 1) Storage Key Constants ────────────────────────────────────────────── */

  const NS_DIET = `h2o:${SUITE}:${HOST}:diet`;

  const KEY_DIET_GLOBAL         = `${NS_DIET}:global:v1`;
  const KEY_DIET_CHAT           = (chatId) => `${NS_DIET}:chat:${String(chatId || 'unknown')}:v1`;
  const KEY_DIET_LAST_RESOLVED  = (chatId) => `${NS_DIET}:lastResolved:${String(chatId || 'unknown')}:v1`;

  /* ─── 2) Profile Constants ────────────────────────────────────────────────── */

  const PROFILE_FULL        = 'Full';
  const PROFILE_LIGHT       = 'Light';
  const PROFILE_ULTRA_LIGHT = 'Ultra-Light';
  const PROFILE_CUSTOM      = 'Custom';
  const PROFILE_DEFAULT     = PROFILE_FULL;

  const PROFILES_VALID = Object.freeze([
    PROFILE_FULL,
    PROFILE_LIGHT,
    PROFILE_ULTRA_LIGHT,
    PROFILE_CUSTOM,
  ]);

  /* ─── 3) Profile → Executor Plan Map ─────────────────────────────────────── */

  /*
   * Plan shape:
   *   pagination: { enabled, pageSize?, bufferAnswers? }
   *   unmount:    { enabled, minMsgsForUnmount?, unmountMarginPx? }
   *
   * null plan field = executor is not touched by this profile.
   * Numeric values match existing executor defaults; only override what matters.
   */

  const PLAN_FULL = Object.freeze({
    pagination: Object.freeze({ enabled: false }),
    unmount:    Object.freeze({ enabled: false }),
  });

  const PLAN_LIGHT = Object.freeze({
    pagination: Object.freeze({ enabled: true, pageSize: 25, bufferAnswers: 10 }),
    unmount:    Object.freeze({ enabled: true, minMsgsForUnmount: 25, unmountMarginPx: 2000 }),
  });

  const PLAN_ULTRA_LIGHT = Object.freeze({
    pagination: Object.freeze({ enabled: true, pageSize: 15, bufferAnswers: 5 }),
    unmount:    Object.freeze({ enabled: true, minMsgsForUnmount: 20, unmountMarginPx: 1500 }),
  });

  const PLAN_MAP = Object.freeze({
    [PROFILE_FULL]:        PLAN_FULL,
    [PROFILE_LIGHT]:       PLAN_LIGHT,
    [PROFILE_ULTRA_LIGHT]: PLAN_ULTRA_LIGHT,
    [PROFILE_CUSTOM]:      null,  // plan comes from stored customPlan or falls back to Full
  });

  /* ─── 4) Storage Helpers ─────────────────────────────────────────────────── */

  function DS_readJSON(key, fallback) {
    try {
      const raw = W.localStorage?.getItem?.(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function DS_writeJSON(key, obj) {
    try {
      W.localStorage?.setItem?.(key, JSON.stringify(obj || {}));
      return true;
    } catch (_) {
      return false;
    }
  }

  function DS_normalizeProfileName(v, fallback) {
    const s = String(v || '').trim();
    return PROFILES_VALID.includes(s) ? s : (fallback || PROFILE_DEFAULT);
  }

  /* ─── 5) Global Profile R/W ──────────────────────────────────────────────── */

  function DS_readGlobal() {
    const d = DS_readJSON(KEY_DIET_GLOBAL, {});
    return {
      profile:    DS_normalizeProfileName(d.profile, PROFILE_DEFAULT),
      customPlan: (d.customPlan && typeof d.customPlan === 'object') ? d.customPlan : null,
    };
  }

  function DS_writeGlobal(data) {
    const current = DS_readGlobal();
    const next = {
      profile:    DS_normalizeProfileName(data && data.profile, current.profile),
      customPlan: (data && data.customPlan) ? data.customPlan : current.customPlan,
    };
    return DS_writeJSON(KEY_DIET_GLOBAL, next);
  }

  /* ─── 6) Per-Chat Profile R/W ────────────────────────────────────────────── */

  function DS_readChat(chatId) {
    const d = DS_readJSON(KEY_DIET_CHAT(chatId), null);
    if (!d) return null;
    const profile = DS_normalizeProfileName(d.profile, null);
    if (!profile) return null;
    return {
      profile,
      customPlan: (d.customPlan && typeof d.customPlan === 'object') ? d.customPlan : null,
    };
  }

  function DS_writeChat(chatId, data) {
    const next = {
      profile:    DS_normalizeProfileName(data && data.profile, PROFILE_DEFAULT),
      customPlan: (data && data.customPlan) ? data.customPlan : null,
    };
    return DS_writeJSON(KEY_DIET_CHAT(chatId), next);
  }

  /* ─── 7) Profile Resolution ──────────────────────────────────────────────── */

  /**
   * Resolves the effective profile for a chatId.
   * Per-chat override wins over global default.
   * Returns: { profileName, source: 'chat'|'global', customPlan }
   */
  function DS_resolve(chatId) {
    const chat   = DS_readChat(chatId);
    const global = DS_readGlobal();
    if (chat && chat.profile) {
      return {
        profileName: chat.profile,
        source:      'chat',
        customPlan:  chat.customPlan || global.customPlan || null,
      };
    }
    return {
      profileName: global.profile,
      source:      'global',
      customPlan:  global.customPlan || null,
    };
  }

  /**
   * Builds a concrete executor plan from a resolved profile object or name string.
   * For Custom, uses resolved.customPlan if present; otherwise falls back to Full.
   */
  function DS_buildPlan(resolved) {
    const name = typeof resolved === 'string'
      ? resolved
      : (resolved && resolved.profileName) || PROFILE_DEFAULT;

    const normalized = DS_normalizeProfileName(name, PROFILE_DEFAULT);

    if (normalized === PROFILE_CUSTOM) {
      const cp = (resolved && typeof resolved === 'object') ? resolved.customPlan : null;
      if (cp && typeof cp === 'object') return cp;
      return PLAN_FULL;  // Custom with no stored plan → Full (safest fallback)
    }

    return PLAN_MAP[normalized] || PLAN_FULL;
  }

  /* ─── 8) Last Resolved State R/W ─────────────────────────────────────────── */

  function DS_readLastResolved(chatId) {
    return DS_readJSON(KEY_DIET_LAST_RESOLVED(chatId), null);
  }

  function DS_writeLastResolved(chatId, state) {
    return DS_writeJSON(KEY_DIET_LAST_RESOLVED(chatId), state || {});
  }

  /* ─── 9) Public API ──────────────────────────────────────────────────────── */

  VAULT.api = {
    // Profile name constants (exported for consumers)
    PROFILES_VALID,
    PROFILE_DEFAULT,
    PROFILE_FULL,
    PROFILE_LIGHT,
    PROFILE_ULTRA_LIGHT,
    PROFILE_CUSTOM,

    // Storage operations
    readGlobal:         DS_readGlobal,
    writeGlobal:        DS_writeGlobal,
    readChat:           DS_readChat,
    writeChat:          DS_writeChat,
    readLastResolved:   DS_readLastResolved,
    writeLastResolved:  DS_writeLastResolved,

    // Resolution + planning
    resolve:    DS_resolve,
    buildPlan:  DS_buildPlan,
  };

  /* ─── 10) Register on shared H2O.diet namespace ──────────────────────────── */

  H2O.diet = H2O.diet || {};
  if (!H2O.diet.store) {
    H2O.diet.store = VAULT.api;
  }

})();
