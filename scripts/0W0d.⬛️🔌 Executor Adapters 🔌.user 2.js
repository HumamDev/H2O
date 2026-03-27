// ==UserScript==
// @h2o-id             0w0d.executor.adapters
// @name               0W0d.⬛️🔌 Executor Adapters 🔌
// @namespace          H2O.Premium.CGX.executor.adapters
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260326-000000
// @description        Thin adapter layer for H2O Performance Governor: normalizes Governor executor plans into existing Pagination and Unmount APIs without touching their internals.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

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

  /* ─── 1) Event Constants ─────────────────────────────────────────────────── */

  // Listening only — this event is owned and emitted by Pagination Windowing
  const EV_PG_PAGE_CHANGED = 'evt:h2o:pagination:pagechanged';

  const SETTLE_TIMEOUT_DEFAULT_MS = 600;

  /* ─── 2) Pagination Adapter ──────────────────────────────────────────────── */

  /*
   * Owns: thin normalization of Governor PaginationPlan → W.H2O_Pagination API calls.
   *
   * PaginationPlan shape (from Store):
   *   { enabled: bool, pageSize?: number, bufferAnswers?: number }
   *
   * Maps to executor applySetting keys:
   *   enabled       → setEnabled()
   *   pageSize      → applySetting('pwPageSize', val)
   *   bufferAnswers → applySetting('pwBufferAnswers', val)
   */

  function PA_PG_isReady() {
    const api = W.H2O_Pagination;
    if (!api || typeof api !== 'object') return false;
    return (typeof api.setEnabled === 'function' && typeof api.applySetting === 'function');
  }

  function PA_PG_applyPlan(plan) {
    if (!plan || typeof plan !== 'object') return false;
    if (!PA_PG_isReady()) return false;

    const api = W.H2O_Pagination;

    if (plan.enabled === false) {
      // Disable first — settings are irrelevant on a torn-down executor
      api.setEnabled(false);
      return true;
    }

    // Apply settings before (re-)enabling so executor boots with the correct config
    if (plan.pageSize !== undefined)     api.applySetting('pwPageSize', plan.pageSize);
    if (plan.bufferAnswers !== undefined) api.applySetting('pwBufferAnswers', plan.bufferAnswers);
    if (plan.enabled === true)           api.setEnabled(true);

    return true;
  }

  /**
   * Calls cb after the next pagination page render (or after timeoutMs, whichever comes first).
   * Used by Governor to wait for Pagination to settle before applying Unmount.
   */
  function PA_PG_onPageSettled(cb, timeoutMs) {
    if (typeof cb !== 'function') return;

    let fired = false;

    const fire = () => {
      if (fired) return;
      fired = true;
      W.removeEventListener(EV_PG_PAGE_CHANGED, onEvt);
      W.clearTimeout(timer);
      try { cb(); } catch (_) {}
    };

    const onEvt = () => fire();
    W.addEventListener(EV_PG_PAGE_CHANGED, onEvt);
    const timer = W.setTimeout(fire, (Number.isFinite(timeoutMs) && timeoutMs > 0) ? timeoutMs : SETTLE_TIMEOUT_DEFAULT_MS);
  }

  const PaginationAdapter = Object.freeze({
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
