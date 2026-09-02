// ==H2O Module==
// @h2o-id             0b1c.perf.adapters
// @name               0B1c.⬛️⚡ Performance Adapters 🔌⚡
// @namespace          H2O.Premium.CGX.executor.adapters
// @author             HumamDev
// @version            2.0.0
// @revision           001
// @build              260326-000000
// @description        Performance Governor adapters: an inert retired Pagination stage and the existing Unmount executor normalization.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

(() => {
  'use strict';

  /* ============================================================================
   * 💧 H2O — Executor Adapters (Phase 1 MVP)
   * Owns: PaginationAdapter + UnmountAdapter.
   * Each adapter is a thin normalization shim. No executor logic lives here.
   * Registers on H2O.diet.adapters for Governor consumption.
   * ========================================================================== */

  /* ─── 0) Identity ─────────────────────────────────────────────────────────── */

  const TOK    = 'XA';
  const PID    = 'excadpt';
  const CID    = 'execadapters';
  const SkID   = 'xcad';
  const MODTAG = 'ExecAdapters';
  const SUITE  = 'prm';
  const HOST   = 'cgx';
  const BrID   = PID;

  const W   = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK]  = H2O[TOK] || {};
  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});
  VAULT.meta  = VAULT.meta || { tok: TOK, pid: PID, cid: CID, skid: SkID, modtag: MODTAG, suite: SUITE, host: HOST };

  /* ─── 2) Pagination Adapter ──────────────────────────────────────────────── */

  /* Physical Pagination is retired. Keep this stable adapter object so the
   * Governor can consume old plans without acquiring a new activation path. */

  function PA_PG_isReady() {
    return false;
  }

  function PA_PG_applyPlan() {
    return false;
  }

  // No physical page work can be pending. Preserve Governor sequencing by
  // completing the retired stage synchronously without an event or timer.
  function PA_PG_onPageSettled(cb) {
    if (typeof cb !== 'function') return;
    try { cb({ retired: true, status: 'retired' }); } catch (_) {}
  }

  const PaginationAdapter = Object.freeze({
    retired:        true,
    isReady:        PA_PG_isReady,
    applyPlan:      PA_PG_applyPlan,
    onPageSettled:  PA_PG_onPageSettled,
  });

  /* ─── 3) Unmount Adapter ─────────────────────────────────────────────────── */

  /*
   * Owns: thin normalization of Governor UnmountPlan → H2O.UM.nmntmssgs.api calls.
   *
   * UnmountPlan shape (from Store):
   *   { enabled: bool, minMsgsForUnmount?: number, unmountMarginPx?: number }
   *
   * Maps to executor applySetting keys:
   *   enabled            → setEnabled()
   *   minMsgsForUnmount  → applySetting('umMinMessages', val)
   *   unmountMarginPx    → applySetting('umMarginPx', val)
   */

  function PA_UM_getApi() {
    // Unmount vault: H2O['UM']['nmntmssgs'].api  (TOK='UM', PID='nmntmssgs')
    return (W.H2O && W.H2O.UM && W.H2O.UM.nmntmssgs && W.H2O.UM.nmntmssgs.api) || null;
  }

  function PA_UM_isReady() {
    const api = PA_UM_getApi();
    if (!api || typeof api !== 'object') return false;
    return (typeof api.setEnabled === 'function' && typeof api.applySetting === 'function');
  }

  function PA_UM_applyPlan(plan) {
    if (!plan || typeof plan !== 'object') return false;
    if (!PA_UM_isReady()) return false;

    const api = PA_UM_getApi();

    if (plan.enabled === false) {
      // Disable first — settings are irrelevant on a torn-down executor
      api.setEnabled(false);
      return true;
    }

    // Apply settings before (re-)enabling so executor activates with the correct config
    if (plan.minMsgsForUnmount !== undefined) api.applySetting('umMinMessages', plan.minMsgsForUnmount);
    if (plan.unmountMarginPx !== undefined)   api.applySetting('umMarginPx', plan.unmountMarginPx);
    if (plan.enabled === true)                api.setEnabled(true);

    return true;
  }

  const UnmountAdapter = Object.freeze({
    isReady:    PA_UM_isReady,
    applyPlan:  PA_UM_applyPlan,
  });

  /* ─── 4) Register ────────────────────────────────────────────────────────── */

  VAULT.api = Object.freeze({ PaginationAdapter, UnmountAdapter });

  H2O.diet = H2O.diet || {};
  H2O.diet.adapters = H2O.diet.adapters || {};

  if (!H2O.diet.adapters.pagination) H2O.diet.adapters.pagination = PaginationAdapter;
  if (!H2O.diet.adapters.unmount)    H2O.diet.adapters.unmount    = UnmountAdapter;

})();
