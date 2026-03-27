// ==UserScript==
// @h2o-id             0w0a.perf.governor
// @name               0W0a.⬛️🧭 Performance Governor 🧭
// @namespace          H2O.Premium.CGX.perf.governor
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260326-000000
// @description        Policy/orchestration layer for H2O performance executors. Resolves a profile (Full/Light/Ultra-Light/Custom), applies Pagination first, waits for settle, then applies Unmount. Exposes window.H2O_Diet.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* ============================================================================
   * 💧 H2O — Performance Governor (Phase 1 MVP)
   * Policy + orchestration only. Does NOT own executor logic.
   * Executors (Pagination + Unmount) keep full ownership of their execution.
   * Governor coordinates: resolve profile → apply Pagination → settle → apply Unmount.
   * ========================================================================== */

  /* ─── 0) Identity ─────────────────────────────────────────────────────────── */

  const TOK    = 'GV';
  const PID    = 'prfgvn';
  const CID    = 'perfgov';
  const SkID   = 'pgvn';
  const MODTAG = 'PerfGov';
  const MODICON = '🧭';
  const EMOJI_HDR = '⬛';
  const SUITE  = 'prm';
  const HOST   = 'cgx';
  const BrID   = PID;

  const W   = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK]  = H2O[TOK] || {};
  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});
  VAULT.meta  = VAULT.meta || { tok: TOK, pid: PID, cid: CID, skid: SkID, modtag: MODTAG, suite: SUITE, host: HOST };

  // Optional ecosystem registries
  H2O.KEYS = H2O.KEYS || {};
  H2O.EV   = H2O.EV   || {};

  /* ─── 1) Contract Tokens ─────────────────────────────────────────────────── */

  const NS_MEM_GV_ROOT = `${TOK}:${PID}:guard`;
  const KEY_GV_GUARD_BOOT = `${NS_MEM_GV_ROOT}:booted`;

  // Governor events (emitted only — Governor does not replace executor events)
  const EV_DIET_PROFILE_RESOLVED = 'evt:h2o:diet:profile-resolved';
  const EV_DIET_BEFORE_APPLY     = 'evt:h2o:diet:before-apply';
  const EV_DIET_EXECUTOR_PLAN    = 'evt:h2o:diet:executor-plan';
  const EV_DIET_EXECUTOR_APPLIED = 'evt:h2o:diet:executor-applied';
  const EV_DIET_MODE_CHANGED     = 'evt:h2o:diet:mode-changed';
  const EV_DIET_STARTUP_SETTLED  = 'evt:h2o:diet:startup-settled';

  // Timing
  const BOOT_RETRY_INTERVAL_MS = 350;
  const SETTLE_TIMEOUT_MS      = 600;

  /* ─── 2) State ───────────────────────────────────────────────────────────── */

  VAULT.state = VAULT.state || {};
  const S = VAULT.state;
  S.booted         = !!S.booted;
  S.applying       = !!S.applying;
  S.lastProfile    = S.lastProfile    || null;
  S.lastPlan       = S.lastPlan       || null;
  S.lastAppliedAt  = Number(S.lastAppliedAt  || 0);
  S.chatId         = S.chatId         || '';
  S.bootRetryTimer = Number(S.bootRetryTimer || 0);

  /* ─── 3) Helpers ─────────────────────────────────────────────────────────── */

  function GV_safeDispatch(name, detail) {
    try { W.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {}
  }

  function GV_safeWarn(msg, extra) {
    try { console.warn(`[${EMOJI_HDR} ${MODICON} ${MODTAG}]`, msg, extra || ''); } catch (_) {}
  }

  /**
   * Resolves chatId from current URL.
   * Mirrors the same logic used in Pagination Windowing for consistent keys.
   */
  function GV_getChatId() {
    const path = String(location.pathname || '/');
    const m = path.match(/\/c\/([^/?#]+)/i) || path.match(/\/g\/([^/?#]+)/i);
    if (m && m[1]) {
      try { return decodeURIComponent(m[1]); } catch (_) { return m[1]; }
    }
    // Stable fallback hash for non-conversation pages
    let h = 2166136261;
    const str = `${location.origin}${path}${location.search || ''}`;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return `path_${(h >>> 0).toString(36)}`;
  }

  /* ─── 4) Dependency Accessors ────────────────────────────────────────────── */

  function GV_getStore() {
    return (H2O.diet && H2O.diet.store) || null;
  }

  function GV_getPaginationAdapter() {
    return (H2O.diet && H2O.diet.adapters && H2O.diet.adapters.pagination) || null;
  }

  function GV_getUnmountAdapter() {
    return (H2O.diet && H2O.diet.adapters && H2O.diet.adapters.unmount) || null;
  }

  /**
   * Returns true only when Store, both Adapters, and both executor APIs are present.
   * Governor cannot coordinate a partial subsystem — requires both executors reachable.
   */
  function GV_depsReady() {
    if (!GV_getStore()) return false;
    const pg = GV_getPaginationAdapter();
    const um = GV_getUnmountAdapter();
    if (!pg || !um) return false;
    // Both executors must be reachable before Governor boots
    return !!(pg.isReady() && um.isReady());
  }

  /* ─── 5) Core: Resolve & Apply ───────────────────────────────────────────── */

  /**
   * Main Governor orchestration:
   *   1) Resolve profile from Store (per-chat override → global default)
   *   2) Build executor plan from Store plan map
   *   3) Apply Pagination plan FIRST
   *   4) Wait for Pagination to settle (pagechanged event or timeout)
   *   5) Apply Unmount plan SECOND
   *   6) Publish Governor state via events
   */
  function GV_resolveAndApply(reason) {
    if (S.applying) return;

    const store = GV_getStore();
    const pgAdapter = GV_getPaginationAdapter();
    const umAdapter = GV_getUnmountAdapter();

    if (!store) return;

    S.chatId = GV_getChatId();

    // 1) Resolve profile
    const resolved = store.resolve(S.chatId);

    GV_safeDispatch(EV_DIET_PROFILE_RESOLVED, {
      profile: resolved.profileName,
      source:  resolved.source,
      chatId:  S.chatId,
      reason:  String(reason || ''),
      ts:      Date.now(),
    });

    // 2) Build plan
    const plan = store.buildPlan(resolved);

    GV_safeDispatch(EV_DIET_EXECUTOR_PLAN, {
      profile: resolved.profileName,
      plan,
      ts: Date.now(),
    });

    S.lastProfile = resolved.profileName;
    S.lastPlan    = plan;
    S.applying    = true;

    GV_safeDispatch(EV_DIET_BEFORE_APPLY, {
      profile: resolved.profileName,
      plan,
      ts: Date.now(),
    });

    // 3) Apply Pagination FIRST
    const pgApplied = (pgAdapter && pgAdapter.isReady() && plan.pagination)
      ? pgAdapter.applyPlan(plan.pagination)
      : false;

    // 4) Wait for settle, then apply Unmount SECOND
    const proceed = () => {
      const umApplied = (umAdapter && umAdapter.isReady() && plan.unmount)
        ? umAdapter.applyPlan(plan.unmount)
        : false;

      S.applying      = false;
      S.lastAppliedAt = Date.now();

      GV_safeDispatch(EV_DIET_EXECUTOR_APPLIED, {
        profile:   resolved.profileName,
        pgApplied,
        umApplied,
        ts: Date.now(),
      });

      // Persist last resolved state for diagnostics / restore
      try {
        store.writeLastResolved(S.chatId, {
          profile:   resolved.profileName,
          source:    resolved.source,
          appliedAt: S.lastAppliedAt,
        });
      } catch (_) {}

      GV_safeDispatch(EV_DIET_STARTUP_SETTLED, {
        profile: resolved.profileName,
        ts: Date.now(),
      });
    };

    // If Pagination was applied, wait for its render to settle before Unmount
    // (avoids Unmount running on a DOM that Pagination is mid-swap)
    if (pgApplied && pgAdapter && typeof pgAdapter.onPageSettled === 'function') {
      pgAdapter.onPageSettled(proceed, SETTLE_TIMEOUT_MS);
    } else {
      // Pagination untouched or not ready — no settle needed
      proceed();
    }
  }

  /* ─── 6) Boot / Dispose ──────────────────────────────────────────────────── */

  function GV_clearBootRetry() {
    if (S.bootRetryTimer) {
      try { W.clearInterval(S.bootRetryTimer); } catch (_) {}
      S.bootRetryTimer = 0;
    }
  }

  /**
   * Boot (idempotent).
   * If deps are not ready yet, arms a retry interval and returns false.
   * Once deps are ready, runs the first resolveAndApply.
   */
  function GV_boot(reason) {
    if (S.booted)      return true;
    if (W[KEY_GV_GUARD_BOOT]) return true;

    if (!GV_depsReady()) {
      if (!S.bootRetryTimer) {
        S.bootRetryTimer = W.setInterval(() => {
          if (!GV_depsReady()) return;
          GV_clearBootRetry();
          GV_boot(reason || 'retry');
        }, BOOT_RETRY_INTERVAL_MS);
      }
      return false;
    }

    GV_clearBootRetry();
    W[KEY_GV_GUARD_BOOT] = 1;
    S.booted = true;

    try {
      GV_resolveAndApply(reason || 'boot');
    } catch (err) {
      GV_safeWarn('resolveAndApply crash during boot', err);
    }

    return true;
  }

  /**
   * Dispose (best-effort cleanup). Clears retry timer and resets boot guard.
   * Executors clean up themselves; Governor only cleans its own state.
   */
  function GV_dispose(reason) {
    GV_clearBootRetry();
    try { delete W[KEY_GV_GUARD_BOOT]; } catch (_) { W[KEY_GV_GUARD_BOOT] = undefined; }
    S.booted   = false;
    S.applying = false;
    return { ok: true, reason: String(reason || 'dispose') };
  }

  /* ─── 7) Public API ──────────────────────────────────────────────────────── */

  /** Returns a snapshot of current Governor state (safe copy). */
  function GV_getState() {
    return {
      booted:       S.booted,
      applying:     S.applying,
      chatId:       S.chatId,
      lastProfile:  S.lastProfile,
      lastAppliedAt: S.lastAppliedAt,
    };
  }

  /**
   * Returns the currently resolved profile for the active chat.
   * Does not persist or apply anything.
   */
  function GV_getResolvedProfile() {
    const store = GV_getStore();
    if (!store) return null;
    return store.resolve(GV_getChatId());
  }

  /**
   * Persists a profile choice WITHOUT applying it.
   * opts.chatId  → write as per-chat override (defaults to current chat)
   * omit opts    → write as global default
   */
  function GV_setProfile(profileName, opts) {
    const store = GV_getStore();
    if (!store) return false;
    const name = String(profileName || '').trim();
    if (!store.PROFILES_VALID.includes(name)) return false;

    const chatId = (opts && opts.chatId) ? String(opts.chatId) : null;
    const customPlan = (opts && opts.customPlan) ? opts.customPlan : null;

    if (chatId) {
      store.writeChat(chatId, { profile: name, customPlan });
    } else {
      store.writeGlobal({ profile: name, customPlan });
    }

    GV_safeDispatch(EV_DIET_MODE_CHANGED, {
      profile: name,
      scope:   chatId ? 'chat' : 'global',
      chatId:  chatId || null,
      ts:      Date.now(),
    });

    return true;
  }

  /**
   * Persists a profile choice AND immediately applies it.
   * Same opts as setProfile().
   */
  function GV_applyProfile(profileName, opts) {
    const ok = GV_setProfile(profileName, opts);
    if (!ok) return false;
    try { GV_resolveAndApply('api:applyProfile'); } catch (err) { GV_safeWarn('applyProfile crash', err); }
    return true;
  }

  /**
   * Re-applies the currently resolved profile without changing persistence.
   */
  function GV_reapply(reason) {
    try { GV_resolveAndApply(reason || 'api:reapply'); } catch (err) { GV_safeWarn('reapply crash', err); }
  }

  const API = {
    boot:               GV_boot,
    dispose:            GV_dispose,
    getState:           GV_getState,
    getResolvedProfile: GV_getResolvedProfile,
    setProfile:         GV_setProfile,
    applyProfile:       GV_applyProfile,
    reapply:            GV_reapply,
  };

  VAULT.api = API;

  /* ─── 8) Feature Registration ────────────────────────────────────────────── */

  function GV_registerFeatureSurfaces() {
    const feature = {
      key:         'performanceGovernor',
      label:       'Performance Governor',
      description: 'Coordinates Pagination + Unmount via a resolved performance profile (Full/Light/Ultra-Light/Custom).',
      enabled()    { return S.booted && S.lastProfile !== null; },
      setEnabled(on) {
        if (on) {
          if (!S.booted) GV_boot('feature:enable');
          else GV_reapply('feature:enable');
        } else {
          // Apply Full profile first (cleanly disables both executors), then stop managing.
          // The async Unmount half of the apply still completes via its captured closure.
          if (S.booted) GV_applyProfile('Full');
          GV_dispose('feature:disable');
        }
        return S.booted;
      },
      getSummary() {
        if (!S.booted) return 'Not booted';
        return S.lastProfile ? `Profile: ${S.lastProfile}` : 'Booted • no profile applied';
      },
      applySetting(optKey, val) {
        // gvProfile — apply a new profile by name (global, current chat)
        if (optKey === 'gvProfile') return GV_applyProfile(String(val || ''));
        return false;
      },
    };

    const attach = (host) => {
      if (!host) return;
      host.features = host.features || {};
      host.features.performanceGovernor = feature;
    };

    W.h2oConfig = W.h2oConfig || {};
    W.hoConfig  = W.hoConfig  || W.h2oConfig;
    attach(W.h2oConfig);
    attach(W.hoConfig);
  }

  /* ─── 9) Namespace + Global Registration ────────────────────────────────── */

  H2O.diet = H2O.diet || {};
  H2O.diet.governor = API;

  // Replace any prior Governor instance gracefully
  const prevApi = W.H2O_Diet;
  if (prevApi && prevApi !== API && typeof prevApi.dispose === 'function') {
    try { prevApi.dispose('replace'); } catch (_) {}
  }
  W.H2O_Diet = API;

  GV_registerFeatureSurfaces();

  /* ─── 10) Entry Point ────────────────────────────────────────────────────── */

  try {
    GV_boot('init');
  } catch (err) {
    GV_safeWarn('boot crash', err);
    try { GV_dispose('boot-crash'); } catch (_) {}
  }

})();
